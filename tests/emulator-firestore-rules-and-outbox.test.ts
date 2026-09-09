import test, { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    initializeTestEnvironment,
    RulesTestEnvironment,
    assertFails,
    assertSucceeds
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { AUTHORIZED_FIREBASE_UID } from '../src/lib/server-auth';

import * as net from 'node:net';

async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            resolve(false);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
}

describe('Real Firestore Rules & Transaction Outbox Emulator Tests', () => {
    let testEnv: RulesTestEnvironment;
    let emulatorAvailable = false;
    const PROJECT_ID = 'blumecore-emulator-test';

    before(async () => {
        emulatorAvailable = await isPortOpen(8080);
        if (!emulatorAvailable) {
            console.log('\n[INFO] Firestore Emulator is not running on 127.0.0.1:8080. Skipping emulator integration tests. (Run with: npm run test:emulator)\n');
            return;
        }

        if (!getApps().length) {
            initializeApp({
                projectId: PROJECT_ID,
                apiKey: 'mock-key',
                authDomain: 'mock-auth'
            });
        }

        const rulesPath = path.resolve(__dirname, '../firestore.rules');
        const rules = fs.readFileSync(rulesPath, 'utf8');

        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: {
                host: '127.0.0.1',
                port: 8080,
                rules
            }
        });
    });

    after(async () => {
        if (testEnv) {
            await testEnv.cleanup();
        }
    });

    beforeEach(async () => {
        if (testEnv && emulatorAvailable) {
            await testEnv.clearFirestore();
        }
    });

    describe('1. Real Firestore Security Rules Lock Verification', () => {
        it('should ALLOW read and write for the single authorized BlumeCore owner UID', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            const ownerContext = testEnv.authenticatedContext(AUTHORIZED_FIREBASE_UID);
            const ownerDb = ownerContext.firestore();

            // 1. Write to mod_projects
            const modRef = doc(ownerDb, 'mod_projects', 'mod-test-1');
            await assertSucceeds(
                setDoc(modRef, {
                    name: 'Test Mod',
                    status: 'ACTIVE',
                    createdAt: Date.now()
                })
            );

            // 2. Read from mod_projects
            const snap = await assertSucceeds(getDoc(modRef));
            assert.strictEqual(snap.exists(), true);
            assert.strictEqual(snap.data()?.name, 'Test Mod');

            // 3. Write to youtubers
            const ytRef = doc(ownerDb, 'youtubers', 'yt-test-1');
            await assertSucceeds(
                setDoc(ytRef, {
                    name: 'Test YouTuber',
                    createdAt: Date.now()
                })
            );

            // 4. Delete document
            await assertSucceeds(deleteDoc(modRef));
        });

        it('should DENY read and write for any other authenticated Firebase UID', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            const otherContext = testEnv.authenticatedContext('unauthorized-other-uid');
            const otherDb = otherContext.firestore();

            const modRef = doc(otherDb, 'mod_projects', 'mod-test-1');

            // Attempt to write
            await assertFails(
                setDoc(modRef, {
                    name: 'Hacked Mod',
                    status: 'ACTIVE'
                })
            );

            // Attempt to read
            await assertFails(getDoc(modRef));
        });

        it('should DENY read and write for unauthenticated requests', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            const unauthContext = testEnv.unauthenticatedContext();
            const unauthDb = unauthContext.firestore();

            const docRef = doc(unauthDb, 'mod_projects', 'any-doc');

            // Attempt to write
            await assertFails(
                setDoc(docRef, {
                    name: 'Unauthorized Mod'
                })
            );

            // Attempt to read
            await assertFails(getDoc(docRef));
        });

        it('should DENY access to any arbitrary collection for non-owner', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            const attackerContext = testEnv.authenticatedContext('attacker-uid');
            const attackerDb = attackerContext.firestore();

            const collections = ['audit_logs', 'github_sync_jobs', 'users', 'arbitrary_collection'];
            for (const col of collections) {
                const targetRef = doc(attackerDb, col, 'target-doc');
                await assertFails(setDoc(targetRef, { hacked: true }));
                await assertFails(getDoc(targetRef));
            }
        });
    });

    describe('2. Real Transaction Outbox & Concurrency Guarantees', () => {
        it('should guarantee atomic claiming in Firestore transactions so concurrent workers cannot run the same job', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
            const { adminDb } = await import('../src/lib/firebase-admin');

            const jobId = 'test-job-atomic-claim';
            const jobRef = adminDb.collection('github_sync_jobs').doc(jobId);

            await jobRef.set({
                modProjectId: 'mod-123',
                status: 'PENDING',
                triggerType: 'MANUAL_SYNC_REQUESTED',
                attemptCount: 0,
                nextAttemptAt: Date.now(),
                lockedAt: null,
                lockedBy: null,
                userId: AUTHORIZED_FIREBASE_UID,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            // Two concurrent worker functions attempting to atomically claim the job
            const claimJobInTransaction = async (workerId: string): Promise<boolean> => {
                return adminDb.runTransaction(async (tx) => {
                    const jobSnap = await tx.get(jobRef);
                    if (!jobSnap.exists) return false;

                    const data = jobSnap.data();
                    const now = Date.now();
                    const isStale = data?.status === 'RUNNING' && data.lockedAt && now - data.lockedAt > 5 * 60 * 1000;

                    if (data?.status !== 'PENDING' && !isStale) {
                        return false; // Already claimed by another worker
                    }

                    tx.update(jobRef, {
                        status: 'RUNNING',
                        lockedAt: now,
                        lockedBy: workerId,
                        attemptCount: (data?.attemptCount || 0) + 1,
                        updatedAt: now
                    });
                    return true;
                });
            };

            // Run both workers concurrently
            const [worker1Result, worker2Result] = await Promise.all([
                claimJobInTransaction('worker-instance-1'),
                claimJobInTransaction('worker-instance-2')
            ]);

            // Exactly ONE worker must succeed, and the other MUST fail to claim
            const successCount = (worker1Result ? 1 : 0) + (worker2Result ? 1 : 0);
            assert.strictEqual(successCount, 1, 'Exactly one worker must successfully claim the job in concurrent transaction');

            // Verify final job state in Firestore
            const finalSnap = await jobRef.get();
            assert.strictEqual(finalSnap.exists, true);
            const data = finalSnap.data();
            assert.strictEqual(data?.status, 'RUNNING');
            assert.strictEqual(data?.attemptCount, 1);
            assert.ok(data?.lockedBy === 'worker-instance-1' || data?.lockedBy === 'worker-instance-2');
        });

        it('should allow reclaiming a stale RUNNING job (>5 minutes locked)', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
            const { adminDb } = await import('../src/lib/firebase-admin');

            const staleJobId = 'test-job-stale-reclaim';
            const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
            const jobRef = adminDb.collection('github_sync_jobs').doc(staleJobId);

            await jobRef.set({
                modProjectId: 'mod-stale',
                status: 'RUNNING',
                attemptCount: 1,
                lockedAt: sixMinutesAgo,
                lockedBy: 'dead-worker',
                userId: AUTHORIZED_FIREBASE_UID,
                createdAt: sixMinutesAgo,
                updatedAt: sixMinutesAgo
            });

            const reclaimResult = await adminDb.runTransaction(async (tx) => {
                const jobSnap = await tx.get(jobRef);
                if (!jobSnap.exists) return false;

                const data = jobSnap.data();
                const now = Date.now();
                const isStale = data?.status === 'RUNNING' && data.lockedAt && now - data.lockedAt > 5 * 60 * 1000;

                if (data?.status !== 'PENDING' && !isStale) {
                    return false;
                }

                tx.update(jobRef, {
                    status: 'RUNNING',
                    lockedAt: now,
                    lockedBy: 'recovered-worker',
                    attemptCount: (data?.attemptCount || 0) + 1,
                    updatedAt: now
                });
                return true;
            });

            assert.strictEqual(reclaimResult, true, 'Stale job must be successfully reclaimed');

            const snap = await jobRef.get();
            const data = snap.data();
            assert.strictEqual(data?.status, 'RUNNING');
            assert.strictEqual(data?.lockedBy, 'recovered-worker');
            assert.strictEqual(data?.attemptCount, 2);
        });

        it('creates mod and INITIAL_SYNC job atomically in transaction adhering to reads-before-writes', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
            const { adminDb } = await import('../src/lib/firebase-admin');
            const { prepareSyncJobInTx, applySyncJobInTx } = await import('../src/lib/mods/mod-service');

            const testUserId = AUTHORIZED_FIREBASE_UID;
            const newModKey = 'AtomicTestMod';
            const now = Date.now();

            const txResult = await adminDb.runTransaction(async (tx) => {
                // 1. ALL READS:
                const modQuery = adminDb.collection('mod_projects').where('userId', '==', testUserId);
                const userModsSnap = await tx.get(modQuery);
                const existing = userModsSnap.docs.find(d => d.data().canonicalModKey === newModKey.toLowerCase());
                assert.strictEqual(existing, undefined);

                const newModDocRef = adminDb.collection('mod_projects').doc();
                // Read pending/running jobs for coalescing
                const preparedJob = await prepareSyncJobInTx(tx, newModDocRef.id, testUserId, 'INITIAL_SYNC');

                // 2. ALL WRITES:
                tx.set(newModDocRef, {
                    modKey: newModKey,
                    canonicalModKey: newModKey.toLowerCase(),
                    displayName: newModKey,
                    userId: testUserId,
                    isActive: true,
                    isArchived: false,
                    lifecycleStatus: 'ACTIVE',
                    createdAt: now,
                    updatedAt: now
                });
                const syncJob = applySyncJobInTx(tx, preparedJob);

                return { modId: newModDocRef.id, jobId: syncJob.id };
            });

            assert.ok(txResult.modId);
            assert.ok(txResult.jobId);

            // Verify mod document was written
            const modSnap = await adminDb.collection('mod_projects').doc(txResult.modId).get();
            assert.strictEqual(modSnap.exists, true);
            assert.strictEqual(modSnap.data()?.modKey, newModKey);

            // Verify INITIAL_SYNC job was written in same transaction
            const jobSnap = await adminDb.collection('github_sync_jobs').doc(txResult.jobId).get();
            assert.strictEqual(jobSnap.exists, true);
            assert.strictEqual(jobSnap.data()?.modProjectId, txResult.modId);
            assert.strictEqual(jobSnap.data()?.triggerType, 'INITIAL_SYNC');
            assert.strictEqual(jobSnap.data()?.status, 'PENDING');
        });

        it('coalesces sync job in transaction if an active job already exists', async (t) => {
            if (!emulatorAvailable) {
                t.skip('Firestore emulator not running on port 8080');
                return;
            }
            process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
            const { adminDb } = await import('../src/lib/firebase-admin');
            const { prepareSyncJobInTx, applySyncJobInTx } = await import('../src/lib/mods/mod-service');

            const testUserId = AUTHORIZED_FIREBASE_UID;
            const modId = 'mod-coalesce-test';

            // Create an existing PENDING job
            const existingJobRef = adminDb.collection('github_sync_jobs').doc('existing-pending-job');
            await existingJobRef.set({
                modProjectId: modId,
                userId: testUserId,
                triggerType: 'MANUAL',
                status: 'PENDING',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            // Run transaction that prepares and applies sync job
            const txResult = await adminDb.runTransaction(async (tx: any) => {
                const prepared = await prepareSyncJobInTx(tx, modId, testUserId, 'INITIAL_SYNC');
                assert.ok(prepared.coalescedJob, 'Should find existing coalesced job');
                assert.strictEqual(prepared.coalescedJob?.id, 'existing-pending-job');

                const job = applySyncJobInTx(tx, prepared);
                return job;
            });

            assert.strictEqual(txResult.id, 'existing-pending-job');
        });
    });
});
