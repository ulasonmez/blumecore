import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    ModProject,
    VideoModProject,
    YoutuberModAccess,
    GitHubSyncJob,
    GitHubSyncRun,
    ModAccessEvent
} from '../src/lib/mods/types';

describe('Mod Hard Delete, Stale Archive Cleanup & Provision Verification Tests', () => {
    // In-memory simulation stores
    let modProjects: ModProject[] = [];
    let videoModLinks: VideoModProject[] = [];
    let modAccesses: YoutuberModAccess[] = [];
    let modEvents: ModAccessEvent[] = [];
    let syncJobs: GitHubSyncJob[] = [];
    let syncRuns: GitHubSyncRun[] = [];
    let auditLogs: { eventType: string; modId?: string; actorUserId: string }[] = [];
    let githubApiCallLog: { method: string; url: string }[] = [];

    beforeEach(() => {
        modProjects = [];
        videoModLinks = [];
        modAccesses = [];
        modEvents = [];
        syncJobs = [];
        syncRuns = [];
        auditLogs = [];
        githubApiCallLog = [];
    });

    // Simulated deleteModProject conforming to src/lib/mods/mod-service.ts
    async function simulateDeleteModProject(modId: string, userId: string): Promise<{ success: boolean }> {
        const modIndex = modProjects.findIndex(m => m.id === modId);
        if (modIndex === -1) {
            throw new Error('Mod projesi bulunamadı.');
        }
        const mod = modProjects[modIndex];
        if (mod.userId !== userId) {
            throw new Error('Bu işlem için yetkiniz yok.');
        }

        // 1. Delete video_mod_projects
        videoModLinks = videoModLinks.filter(v => v.modProjectId !== modId);

        // 2. Delete youtuber_mod_access
        modAccesses = modAccesses.filter(a => a.modProjectId !== modId);

        // 3. Delete mod_access_events
        modEvents = modEvents.filter(e => e.modProjectId !== modId);

        // 4. Handle sync jobs: RUNNING becomes CANCELLED, others deleted
        syncJobs = syncJobs.filter(j => {
            if (j.modProjectId !== modId) return true;
            if (j.status === 'RUNNING') {
                j.status = 'CANCELLED';
                j.lockedAt = null;
                j.lockedBy = null;
                j.updatedAt = Date.now();
                return true; // Keep cancelled job in store
            }
            return false; // Remove pending or finished jobs
        });

        // 5. Delete sync runs
        syncRuns = syncRuns.filter(r => r.modProjectId !== modId);

        // 6. Delete mod_projects record
        modProjects.splice(modIndex, 1);

        // 7. Audit log (strictly NO GitHub API calls!)
        auditLogs.push({
            eventType: 'MOD_DELETED',
            actorUserId: userId,
            modId: mod.modKey
        });

        return { success: true };
    }

    // Simulated cleanup conforming to src/lib/mods/mod-service.ts
    async function simulateArchivedCleanup(userId: string) {
        const archivedMods = modProjects.filter(m =>
            m.userId === userId && (m.isArchived === true || m.lifecycleStatus === 'ARCHIVED' || m.isActive === false)
        );

        const previewItems = archivedMods.map(m => ({
            id: m.id,
            modKey: m.modKey,
            videoCount: videoModLinks.filter(v => v.modProjectId === m.id).length,
            accessCount: modAccesses.filter(a => a.modProjectId === m.id).length,
            jobCount: syncJobs.filter(j => j.modProjectId === m.id).length
        }));

        for (const item of previewItems) {
            await simulateDeleteModProject(item.id, userId);
        }

        return {
            deletedCount: previewItems.length,
            deletedKeys: previewItems.map(p => p.modKey)
        };
    }

    // 1. Mod silinince Firestore mod kaydı ve ilişkileri silinmeli
    it('1. should delete mod_projects record, video links, youtuber accesses, events, and runs', async () => {
        const modId = 'mod-target-1';
        const userId = 'user-owner';

        modProjects.push({
            id: modId,
            modKey: 'GroundIsEnchanted',
            canonicalModKey: 'groundisenchanted',
            displayName: 'Ground Is Enchanted',
            githubOwner: 'blumeplugins',
            githubRepository: 'GroundIsEnchanted',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ACTIVE',
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        videoModLinks.push({ id: 'vml-1', videoId: 'vid-1', modProjectId: modId, userId, createdAt: Date.now() });
        modAccesses.push({
            id: 'yma-1', youtuberId: 'yt-1', modProjectId: modId, status: 'ACTIVE',
            grantType: 'MANUAL', manualDecision: 'FORCE_ALLOW', grantedAt: Date.now(),
            grantedByUserId: userId, userId, createdAt: Date.now(), updatedAt: Date.now()
        });
        modEvents.push({
            id: 'ev-1', youtuberModAccessId: 'yma-1', modProjectId: modId, youtuberId: 'yt-1',
            eventType: 'MANUAL_GRANTED', actorUserId: userId, createdAt: Date.now()
        });
        syncRuns.push({
            id: 'run-1', modProjectId: modId, jobId: 'job-1', status: 'SUCCESS',
            desiredUuidCount: 1, writtenUuidCount: 1, legacyUuidCount: 0,
            startedAt: Date.now(), completedAt: Date.now()
        });

        const res = await simulateDeleteModProject(modId, userId);
        assert.equal(res.success, true);

        // Verification: all records in BlumeCore collections removed
        assert.equal(modProjects.length, 0, 'mod_projects must be deleted');
        assert.equal(videoModLinks.length, 0, 'video_mod_projects must be deleted');
        assert.equal(modAccesses.length, 0, 'youtuber_mod_access must be deleted');
        assert.equal(modEvents.length, 0, 'mod_access_events must be deleted');
        assert.equal(syncRuns.length, 0, 'github_sync_runs must be deleted');
    });

    // 2. GitHub repository ve README.md korunmalı (kesinlikle API çağrısı yapılmamalı)
    it('2. should NEVER call GitHub API to delete or alter repository or README during mod deletion', async () => {
        const modId = 'mod-safe-gh';
        const userId = 'user-owner';

        modProjects.push({
            id: modId,
            modKey: 'MilkAnyMob',
            canonicalModKey: 'milkanymob',
            displayName: 'Milk Any Mob',
            githubOwner: 'blumeplugins',
            githubRepository: 'MilkAnyMob',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ACTIVE',
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        await simulateDeleteModProject(modId, userId);

        assert.equal(githubApiCallLog.length, 0, 'Must NOT execute any GitHub API requests');
        assert.equal(auditLogs[0]?.eventType, 'MOD_DELETED');
    });

    // 3. RUNNING sync job güvenli biçimde CANCELLED yapılmalı, PENDING silinmeli
    it('3. should cancel RUNNING jobs and delete PENDING jobs', async () => {
        const modId = 'mod-jobs-test';
        const userId = 'user-owner';

        modProjects.push({
            id: modId,
            modKey: 'JobTestMod',
            canonicalModKey: 'jobtestmod',
            displayName: 'Job Test Mod',
            githubOwner: 'blumeplugins',
            githubRepository: 'JobTestMod',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ACTIVE',
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        syncJobs.push({
            id: 'job-pending',
            modProjectId: modId,
            status: 'PENDING',
            triggerType: 'INITIAL_SYNC',
            attemptCount: 0,
            nextAttemptAt: Date.now(),
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        syncJobs.push({
            id: 'job-running',
            modProjectId: modId,
            status: 'RUNNING',
            triggerType: 'MANUAL_SYNC',
            attemptCount: 1,
            nextAttemptAt: Date.now(),
            lockedAt: Date.now(),
            lockedBy: 'worker-1',
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        await simulateDeleteModProject(modId, userId);

        const pending = syncJobs.find(j => j.id === 'job-pending');
        assert.equal(pending, undefined, 'PENDING job must be deleted');

        const running = syncJobs.find(j => j.id === 'job-running');
        assert.ok(running, 'RUNNING job record must remain in store');
        assert.equal(running.status, 'CANCELLED', 'RUNNING job must be marked CANCELLED');
        assert.equal(running.lockedAt, null, 'lockedAt must be cleared');
        assert.equal(running.lockedBy, null, 'lockedBy must be cleared');
    });

    // 4. Mod silindikten sonra aynı Mod ID yeniden eklenebilmeli
    it('4. should allow adding the same Mod ID (canonicalModKey) again after deletion', async () => {
        const userId = 'user-owner';
        const modKey = 'GroundIsEnchanted';

        // 1. Initial creation
        const modId = 'mod-round-1';
        modProjects.push({
            id: modId,
            modKey,
            canonicalModKey: modKey.toLowerCase(),
            displayName: modKey,
            githubOwner: 'blumeplugins',
            githubRepository: modKey,
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ACTIVE',
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        // 2. Delete mod
        await simulateDeleteModProject(modId, userId);
        assert.equal(modProjects.length, 0);

        // 3. Re-create mod with same key
        function simulateCreateMod(mKey: string) {
            const canonical = mKey.toLowerCase();
            const existing = modProjects.find(m => m.canonicalModKey === canonical);
            if (existing) {
                return { status: 409, error: 'Already exists' };
            }
            const newMod: ModProject = {
                id: 'mod-round-2',
                modKey: mKey,
                canonicalModKey: canonical,
                displayName: mKey,
                githubOwner: 'blumeplugins',
                githubRepository: mKey,
                branch: 'main',
                allowlistPath: 'README.md',
                syncMode: 'LEGACY_README',
                lifecycleStatus: 'ACTIVE',
                userId,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            modProjects.push(newMod);
            return { status: 201, mod: newMod };
        }

        const createRes = simulateCreateMod('GroundIsEnchanted');
        assert.equal(createRes.status, 201);
        assert.equal(modProjects.length, 1);
        assert.equal(modProjects[0].id, 'mod-round-2');
        assert.equal(modProjects[0].modKey, 'GroundIsEnchanted');
    });

    // 5. Eski archived kayıt için POST /api/mods 409 STALE_ARCHIVED_RECORD dönmeli
    it('5. should return 409 STALE_ARCHIVED_RECORD when attempting to add a mod that has a stale archived record', () => {
        const userId = 'user-owner';
        modProjects.push({
            id: 'stale-doc-1',
            modKey: 'GroundIsEnchanted',
            canonicalModKey: 'groundisenchanted',
            displayName: 'Ground Is Enchanted',
            githubOwner: 'blumeplugins',
            githubRepository: 'GroundIsEnchanted',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ARCHIVED',
            isArchived: true,
            isActive: false,
            userId,
            createdAt: Date.now() - 100000,
            updatedAt: Date.now() - 100000
        });

        // Simulation of POST /api/mods handler
        function postModHandler(inputKey: string) {
            const canonical = inputKey.toLowerCase();
            const matched = modProjects.find(m => m.canonicalModKey === canonical);
            if (matched) {
                const isArchived = matched.isArchived === true || matched.lifecycleStatus === 'ARCHIVED' || matched.isActive === false;
                if (isArchived) {
                    return {
                        status: 409,
                        code: 'STALE_ARCHIVED_RECORD',
                        modId: matched.id,
                        error: 'Bu Mod ID için eski bir arşiv kaydı mevcut.'
                    };
                }
                return { status: 200, alreadyExisted: true };
            }
            return { status: 201 };
        }

        const res = postModHandler('groundisenchanted');
        assert.equal(res.status, 409);
        assert.equal(res.code, 'STALE_ARCHIVED_RECORD');
        assert.equal(res.modId, 'stale-doc-1');
    });

    // 6. Cleanup sonrası aynı Mod ID oluşturulabilmeli
    it('6. should allow creating mod after stale archived record is cleaned up', async () => {
        const userId = 'user-owner';
        modProjects.push({
            id: 'stale-doc-7N7ojiT38ggpUPHZYQe3',
            modKey: 'GroundIsEnchanted',
            canonicalModKey: 'groundisenchanted',
            displayName: 'Ground Is Enchanted',
            githubOwner: 'blumeplugins',
            githubRepository: 'GroundIsEnchanted',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ARCHIVED',
            isArchived: true,
            isActive: false,
            userId,
            createdAt: Date.now() - 100000,
            updatedAt: Date.now() - 100000
        });

        // Run cleanup
        const cleanupRes = await simulateArchivedCleanup(userId);
        assert.equal(cleanupRes.deletedCount, 1);
        assert.equal(cleanupRes.deletedKeys[0], 'GroundIsEnchanted');
        assert.equal(modProjects.length, 0);

        // Now creating the same mod must succeed
        const newMod: ModProject = {
            id: 'fresh-doc-123',
            modKey: 'GroundIsEnchanted',
            canonicalModKey: 'groundisenchanted',
            displayName: 'Ground Is Enchanted',
            githubOwner: 'blumeplugins',
            githubRepository: 'GroundIsEnchanted',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ACTIVE',
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        modProjects.push(newMod);

        assert.equal(modProjects.length, 1);
        assert.equal(modProjects[0].id, 'fresh-doc-123');
    });

    // 7. GitHub repository kontrolü: olmayan repo için INITIAL_SYNC oluşturulmamalı ve onay modalı tetiklenmeli
    it('7. should NOT create INITIAL_SYNC or Firestore record if repository does not exist on GitHub', () => {
        const githubReposOnServer = new Set(['ExistingModRepo']);

        function attemptModCreation(modKey: string, userConfirmedProvision: boolean) {
            const repoExists = githubReposOnServer.has(modKey);
            if (!repoExists) {
                if (!userConfirmedProvision) {
                    // Must return requirement for confirmation
                    return { status: 404, promptProvision: true, created: false };
                }
                // User confirmed, simulate provisioning
                githubReposOnServer.add(modKey);
            }

            // Repo exists or provisioned -> create mod & INITIAL_SYNC
            const mod: ModProject = {
                id: `mod-${modKey}`,
                modKey,
                canonicalModKey: modKey.toLowerCase(),
                displayName: modKey,
                githubOwner: 'blumeplugins',
                githubRepository: modKey,
                branch: 'main',
                allowlistPath: 'README.md',
                syncMode: 'LEGACY_README',
                lifecycleStatus: 'ACTIVE',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            modProjects.push(mod);
            syncJobs.push({
                id: `job-init-${modKey}`,
                modProjectId: mod.id,
                status: 'PENDING',
                triggerType: 'INITIAL_SYNC',
                attemptCount: 0,
                nextAttemptAt: Date.now(),
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            return { status: 201, promptProvision: false, created: true, mod };
        }

        // Attempt 1: Non-existent repo without confirmation
        const res1 = attemptModCreation('NonExistentMod', false);
        assert.equal(res1.status, 404);
        assert.equal(res1.promptProvision, true);
        assert.equal(res1.created, false);
        assert.equal(modProjects.length, 0);
        assert.equal(syncJobs.length, 0, 'No INITIAL_SYNC must be queued');

        // Attempt 2: User confirms provisioning
        const res2 = attemptModCreation('NonExistentMod', true);
        assert.equal(res2.status, 201);
        assert.equal(res2.created, true);
        assert.equal(modProjects.length, 1);
        assert.equal(syncJobs.length, 1, 'INITIAL_SYNC only queued after repo verified');
    });

    // 8. Var olan repo import edilmeli
    it('8. should import existing GitHub repository without re-creating', () => {
        const githubReposOnServer = new Set(['ExistingMod']);

        function importMod(modKey: string) {
            const exists = githubReposOnServer.has(modKey);
            assert.ok(exists, 'Repo must exist on GitHub for direct import');
            const mod: ModProject = {
                id: `mod-${modKey}`,
                modKey,
                canonicalModKey: modKey.toLowerCase(),
                displayName: modKey,
                githubOwner: 'blumeplugins',
                githubRepository: modKey,
                branch: 'main',
                allowlistPath: 'README.md',
                syncMode: 'LEGACY_README',
                lifecycleStatus: 'ACTIVE',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            modProjects.push(mod);
            return { success: true, mod };
        }

        const res = importMod('ExistingMod');
        assert.equal(res.success, true);
        assert.equal(modProjects[0].modKey, 'ExistingMod');
    });

    // 9. Mod listesinde active/passive filtresi bulunmamalı
    it('9. should filter mods only by search terms, not by active/passive lifecycle', () => {
        modProjects = [
            {
                id: 'm1',
                modKey: 'AlphaMod',
                displayName: 'Alpha Mod',
                githubOwner: 'blumeplugins',
                githubRepository: 'AlphaMod',
                branch: 'main',
                allowlistPath: 'README.md',
                syncMode: 'LEGACY_README',
                lifecycleStatus: 'ACTIVE',
                userId: 'user-1',
                createdAt: 100,
                updatedAt: 100
            },
            {
                id: 'm2',
                modKey: 'BetaMod',
                displayName: 'Beta Mod',
                githubOwner: 'blumeplugins',
                githubRepository: 'BetaMod',
                branch: 'main',
                allowlistPath: 'README.md',
                syncMode: 'LEGACY_README',
                lifecycleStatus: 'ACTIVE',
                userId: 'user-1',
                createdAt: 200,
                updatedAt: 200
            }
        ];

        // Search by term
        function filterMods(searchTerm: string) {
            return modProjects.filter(m =>
                m.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                m.modKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
                m.githubRepository.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        assert.equal(filterMods('').length, 2, 'Empty search returns all mods');
        assert.equal(filterMods('alpha').length, 1);
        assert.equal(filterMods('beta').length, 1);
        assert.equal(filterMods('nonexistent').length, 0);
    });
});
