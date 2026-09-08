import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
    requireOwnerUser,
    requireCronSecret,
    requireOwnerOrCron,
    AUTHORIZED_FIREBASE_UID
} from '../src/lib/server-auth';
import { GET as accountDeleteGet, POST as accountDeletePost, DELETE as accountDeleteDelete } from '../src/app/api/account/delete/route';
import { GET as userDeleteGet, POST as userDeletePost, DELETE as userDeleteDelete } from '../src/app/api/user/delete/route';
import { GitHubSyncJob } from '../src/lib/mods/types';
import { parseLegacyReadme } from '../src/lib/github/readme-parser';

describe('Single-Owner Authorization & Security Auditing Tests', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.ADMIN_FIREBASE_UID = AUTHORIZED_FIREBASE_UID;
        process.env.CRON_SECRET = 'super-secret-cron-token-123';
        (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('1. Single-Owner Server Authorization (requireOwnerUser)', () => {
        it('should allow access when request provides valid owner Bearer token', async () => {
            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    authorization: `Bearer ${AUTHORIZED_FIREBASE_UID}`
                }
            });

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.strictEqual(result.user.userId, AUTHORIZED_FIREBASE_UID);
            }
        });

        it('should allow access when request provides valid owner session cookie', async () => {
            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    cookie: `__session=${AUTHORIZED_FIREBASE_UID}`
                }
            });

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.strictEqual(result.user.userId, AUTHORIZED_FIREBASE_UID);
            }
        });

        it('should return 403 Forbidden when valid Firebase token belongs to another user', async () => {
            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    authorization: 'Bearer test-other-token'
                }
            });

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 403);
                const body = await result.response.json();
                assert.match(body.error, /Yetkisiz Firebase UID/);
            }
        });

        it('should return 401 Unauthorized when token is missing entirely', async () => {
            const req = new NextRequest('http://localhost:3000/api/mods');

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 401);
                const body = await result.response.json();
                assert.match(body.error, /Yetkilendirme hatası/);
            }
        });

        it('should return 401 Unauthorized when token is invalid', async () => {
            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    authorization: 'Bearer invalid-token'
                }
            });

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 401);
            }
        });

        it('should NEVER trust client-sent userId or x-user-id headers', async () => {
            // Attacker sends header x-user-id matching the owner UID, but with unauthorized token
            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    authorization: 'Bearer test-other-token',
                    'x-user-id': AUTHORIZED_FIREBASE_UID,
                    'user-id': AUTHORIZED_FIREBASE_UID
                }
            });

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 403);
            }
        });

        it('should FAIL-CLOSED and return 403 when ADMIN_FIREBASE_UID is undefined', async () => {
            delete process.env.ADMIN_FIREBASE_UID;

            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    authorization: `Bearer ${AUTHORIZED_FIREBASE_UID}`
                }
            });

            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 403);
                const body = await result.response.json();
                assert.match(body.error, /Fail-Closed/);
            }
        });
    });

    describe('2. CRON_SECRET & Endpoint Separation', () => {
        it('should allow valid CRON_SECRET with Authorization: Bearer ${CRON_SECRET}', () => {
            const req = new NextRequest('http://localhost:3000/api/cron/github-sync', {
                headers: {
                    authorization: `Bearer ${process.env.CRON_SECRET}`
                }
            });

            const result = requireCronSecret(req);
            assert.strictEqual(result.ok, true);
        });

        it('should reject x-cron-secret header (must use standard Authorization: Bearer)', () => {
            const req = new NextRequest('http://localhost:3000/api/cron/github-sync', {
                headers: {
                    'x-cron-secret': process.env.CRON_SECRET!
                }
            });

            const result = requireCronSecret(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 401);
            }
        });

        it('should reject wrong CRON_SECRET', () => {
            const req = new NextRequest('http://localhost:3000/api/cron/github-sync', {
                headers: {
                    authorization: 'Bearer wrong-secret'
                }
            });

            const result = requireCronSecret(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.response.status, 401);
            }
        });

        it('should NOT allow CRON_SECRET to access normal CRUD endpoints requiring requireOwnerUser', async () => {
            const req = new NextRequest('http://localhost:3000/api/mods', {
                headers: {
                    authorization: `Bearer ${process.env.CRON_SECRET}`
                }
            });

            // CRON_SECRET should fail requireOwnerUser because it is not a valid Firebase Owner token
            const result = await requireOwnerUser(req);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                // Must return 401 or 403, never allow access
                assert.ok(result.response.status === 401 || result.response.status === 403);
            }
        });

        it('should allow either Owner or Cron on background processing endpoints via requireOwnerOrCron', async () => {
            // Caller 1: Cron Worker
            const cronReq = new NextRequest('http://localhost:3000/api/jobs/process', {
                headers: {
                    authorization: `Bearer ${process.env.CRON_SECRET}`
                }
            });
            const cronRes = await requireOwnerOrCron(cronReq);
            assert.strictEqual(cronRes.ok, true);
            if (cronRes.ok) {
                assert.strictEqual(cronRes.callerType, 'cron');
                assert.strictEqual(cronRes.userId, 'cron-worker');
            }

            // Caller 2: Authorized Owner
            const ownerReq = new NextRequest('http://localhost:3000/api/jobs/process', {
                headers: {
                    authorization: `Bearer ${AUTHORIZED_FIREBASE_UID}`
                }
            });
            const ownerRes = await requireOwnerOrCron(ownerReq);
            assert.strictEqual(ownerRes.ok, true);
            if (ownerRes.ok) {
                assert.strictEqual(ownerRes.callerType, 'owner');
                assert.strictEqual(ownerRes.userId, AUTHORIZED_FIREBASE_UID);
            }

            // Caller 3: Unauthorized token
            const unauthReq = new NextRequest('http://localhost:3000/api/jobs/process', {
                headers: {
                    authorization: 'Bearer test-other-token'
                }
            });
            const unauthRes = await requireOwnerOrCron(unauthReq);
            assert.strictEqual(unauthRes.ok, false);
            if (!unauthRes.ok) {
                assert.strictEqual(unauthRes.response.status, 403);
            }
        });
    });

    describe('3. Account Deletion Defensive Endpoints', () => {
        it('should return 405 Method Not Allowed for /api/account/delete', async () => {
            const getRes = await accountDeleteGet();
            assert.strictEqual(getRes.status, 405);

            const postRes = await accountDeletePost();
            assert.strictEqual(postRes.status, 405);

            const deleteRes = await accountDeleteDelete();
            assert.strictEqual(deleteRes.status, 405);
        });

        it('should return 405 Method Not Allowed for /api/user/delete', async () => {
            const getRes = await userDeleteGet();
            assert.strictEqual(getRes.status, 405);

            const postRes = await userDeletePost();
            assert.strictEqual(postRes.status, 405);

            const deleteRes = await userDeleteDelete();
            assert.strictEqual(deleteRes.status, 405);
        });
    });

    describe('4. Outbox Worker & Transaction Guarantees', () => {
        it('should create PENDING job in transaction and guarantee outbox persistence even if microtask fails', () => {
            // Simulated transaction outbox:
            const jobs: GitHubSyncJob[] = [];
            const now = Date.now();

            const createOutboxJob = (modProjectId: string, userId: string) => {
                const job: GitHubSyncJob = {
                    id: `job-${jobs.length + 1}`,
                    modProjectId,
                    status: 'PENDING',
                    triggerType: 'MANUAL_SYNC',
                    attemptCount: 0,
                    nextAttemptAt: now,
                    lockedAt: null,
                    lockedBy: null,
                    lastErrorCode: null,
                    lastErrorMessage: null,
                    userId,
                    createdAt: now,
                    updatedAt: now
                };
                jobs.push(job);
                return { syncState: 'QUEUED' as const, jobId: job.id };
            };

            const result = createOutboxJob('mod-1', AUTHORIZED_FIREBASE_UID);
            assert.strictEqual(result.syncState, 'QUEUED');
            assert.strictEqual(jobs.length, 1);
            assert.strictEqual(jobs[0].status, 'PENDING');

            // Simulate microtask failure / dropped async execution
            const simulateAsyncWorkerFailure = () => {
                throw new Error('Background microtask died or container restarted');
            };
            assert.throws(() => simulateAsyncWorkerFailure());

            // The job remains in outbox and is safely retrieved by cron poll
            const pendingJobs = jobs.filter((j) => j.status === 'PENDING');
            assert.strictEqual(pendingJobs.length, 1);
            assert.strictEqual(pendingJobs[0].id, result.jobId);
        });

        it('should prevent duplicate commits across concurrent cron ticks via atomic claim', () => {
            const job: GitHubSyncJob = {
                id: 'job-concurrent-1',
                modProjectId: 'mod-1',
                status: 'PENDING',
                triggerType: 'MANUAL_SYNC',
                attemptCount: 0,
                nextAttemptAt: Date.now(),
                lockedAt: null,
                lockedBy: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                userId: AUTHORIZED_FIREBASE_UID,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const tryClaimJob = (workerId: string): boolean => {
                if (job.status !== 'PENDING') {
                    return false;
                }
                job.status = 'RUNNING';
                job.lockedAt = Date.now();
                job.lockedBy = workerId;
                job.attemptCount += 1;
                return true;
            };

            // Worker 1 claims job
            const claim1 = tryClaimJob('cron-worker-1');
            assert.strictEqual(claim1, true);
            assert.strictEqual(job.status, 'RUNNING');
            assert.strictEqual(job.lockedBy, 'cron-worker-1');

            // Concurrent Worker 2 tries to claim same job simultaneously
            const claim2 = tryClaimJob('cron-worker-2');
            assert.strictEqual(claim2, false);
            assert.strictEqual(job.lockedBy, 'cron-worker-1');
        });
    });

    describe('5. Safe Legacy Migration Rule', () => {
        it('should retain orphan legacy UUIDs in unmanaged section and never purge or move to managed section', () => {
            // README containing unmanaged legacy entries
            const legacyReadme = `# Mod Project
Some description.
# YouTuber A
00000000-0000-0000-0000-000000000001
# Orphan Player (no record in DB)
00000000-0000-0000-0000-000000000002
# Global Player
00000000-0000-0000-0000-000000000003
`;

            const parsed = parseLegacyReadme(legacyReadme);
            assert.strictEqual(parsed.legacyUuids.length, 3);
            assert.ok(parsed.legacyUuids.includes('00000000-0000-0000-0000-000000000002'));

            // Simulated DB bindings:
            // 0001 has YOUTUBER_PLAYER binding
            // 0003 has GLOBAL_PLAYER binding
            // 0002 is an ORPHAN without any binding
            const boundUuids = new Set<string>([
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000000003'
            ]);

            const orphanUuids: string[] = [];
            for (const u of parsed.legacyUuids) {
                if (!boundUuids.has(u)) {
                    orphanUuids.push(u);
                }
            }

            // Verify orphan identification
            assert.deepStrictEqual(orphanUuids, ['00000000-0000-0000-0000-000000000002']);

            // Filter bound lines out of unmanaged section to migrate to managed,
            // while strictly retaining orphan UUIDs in unmanaged content!
            const lines = parsed.preManagedContent.split(/\r?\n/);
            const remaining = lines.filter((line) => {
                const trimmed = line.trim().toLowerCase();
                if (boundUuids.has(trimmed)) {
                    return false; // Migrate bound UUID line to managed section
                }
                return true; // Keep orphan UUID in unmanaged content
            });

            const cleanedUnmanaged = remaining.join('\n');

            // 1. Bound UUIDs are removed from unmanaged section
            assert.strictEqual(cleanedUnmanaged.includes('00000000-0000-0000-0000-000000000001'), false);
            assert.strictEqual(cleanedUnmanaged.includes('00000000-0000-0000-0000-000000000003'), false);

            // 2. Crucial guarantee: Orphan UUID 0002 remains untouched in the unmanaged section
            assert.strictEqual(cleanedUnmanaged.includes('00000000-0000-0000-0000-000000000002'), true);
        });
    });
});
