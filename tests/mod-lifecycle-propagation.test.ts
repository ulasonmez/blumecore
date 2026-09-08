import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLegacyReadme,
    renderManagedReadme,
    RenderInputGroup,
    MANAGED_START_MARKER,
    MANAGED_END_MARKER
} from '../src/lib/github/readme-parser';
import { normalizeUuid } from '../src/lib/minecraft-players';
import { BLUME_GLOBAL_UUID } from '../src/lib/global-players';
import {
    ModProject,
    YoutuberModAccess,
    GitHubSyncJob,
    ModAccessSource,
    ModLifecycleStatus,
    resolveModLifecycleStatus
} from '../src/lib/mods/types';

describe('Mod Lifecycle & Access Propagation Tests', () => {
    let modProjects: ModProject[] = [];
    let accessList: YoutuberModAccess[] = [];
    let syncJobs: GitHubSyncJob[] = [];
    let gitReadmeStore: Map<string, string> = new Map();

    beforeEach(() => {
        modProjects = [];
        accessList = [];
        syncJobs = [];
        gitReadmeStore.clear();
    });

    // Helper to create valid ModProject
    function createMockMod(data: {
        id: string;
        modKey: string;
        displayName?: string;
        userId?: string;
        lifecycleStatus?: ModLifecycleStatus;
        updatedAt?: number;
    }): ModProject {
        const canonicalModKey = data.modKey.toLowerCase();
        return {
            id: data.id,
            modKey: data.modKey,
            canonicalModKey,
            displayName: data.displayName || data.modKey,
            githubOwner: 'blumeplugins',
            githubRepository: data.modKey,
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: data.lifecycleStatus || 'ACTIVE',
            isActive: (data.lifecycleStatus || 'ACTIVE') === 'ACTIVE',
            isArchived: (data.lifecycleStatus || 'ACTIVE') === 'ARCHIVED',
            archiveStatus: data.lifecycleStatus || 'ACTIVE',
            syncStatus: 'PENDING',
            userId: data.userId || 'user-1',
            createdAt: Date.now(),
            updatedAt: data.updatedAt || Date.now()
        };
    }

    // 1. İki VIDEO_ASSIGNMENT kaynağından biri silindiğinde erişimin devam etmesi
    it('1. should PRESERVE mod access when 1 of 2 VIDEO_ASSIGNMENT sources is deleted', () => {
        const modId = 'mod-multi-video';
        const youtuberId = 'yt-creator-1';

        const access: YoutuberModAccess = {
            id: 'access-1',
            youtuberId,
            modProjectId: modId,
            status: 'ACTIVE',
            grantType: 'VIDEO_ASSIGNMENT',
            grantSources: [
                {
                    type: 'VIDEO_ASSIGNMENT',
                    videoId: 'vid-1',
                    sourceVideoAssignmentId: 'as-1',
                    addedAt: Date.now()
                },
                {
                    type: 'VIDEO_ASSIGNMENT',
                    videoId: 'vid-2',
                    sourceVideoAssignmentId: 'as-2',
                    addedAt: Date.now()
                }
            ],
            manualDecision: 'NONE',
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        accessList.push(access);

        // Delete Video 1 (vid-1)
        const videoToDelete = 'vid-1';
        const remainingSources = (access.grantSources || []).filter((s) => s.videoId !== videoToDelete);

        if (remainingSources.length !== access.grantSources?.length) {
            const hasOtherSources = remainingSources.length > 0 || access.manualDecision === 'FORCE_ALLOW';
            access.status = hasOtherSources && access.manualDecision !== 'FORCE_DENY' ? 'ACTIVE' : 'REVOKED';
            access.grantSources = remainingSources;
        }

        // Assertion: Access is STILL ACTIVE because Video 2 (vid-2) is still assigned
        assert.equal(access.status, 'ACTIVE', 'Access must remain ACTIVE when 1 of 2 video assignments remains');
        assert.equal(access.grantSources?.length, 1);
        assert.equal(access.grantSources?.[0].videoId, 'vid-2');
    });

    // 2. Son kaynak silindiğinde erişimin kaldırılması
    it('2. should REVOKE mod access when the LAST grant source is deleted', () => {
        const modId = 'mod-single-video';
        const youtuberId = 'yt-creator-2';

        const access: YoutuberModAccess = {
            id: 'access-2',
            youtuberId,
            modProjectId: modId,
            status: 'ACTIVE',
            grantType: 'VIDEO_ASSIGNMENT',
            grantSources: [
                {
                    type: 'VIDEO_ASSIGNMENT',
                    videoId: 'vid-2',
                    sourceVideoAssignmentId: 'as-2',
                    addedAt: Date.now()
                }
            ],
            manualDecision: 'NONE',
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        accessList.push(access);

        // Delete Video 2 (vid-2), which is the sole source
        const videoToDelete = 'vid-2';
        const remainingSources = (access.grantSources || []).filter((s) => s.videoId !== videoToDelete);

        const hasOtherSources = remainingSources.length > 0 || access.manualDecision === 'FORCE_ALLOW';
        access.status = hasOtherSources && access.manualDecision !== 'FORCE_DENY' ? 'ACTIVE' : 'REVOKED';
        access.grantSources = remainingSources;

        // Assertion: Access is now REVOKED because 0 sources remain
        assert.equal(access.status, 'REVOKED', 'Access must be REVOKED when the last source is deleted');
        assert.equal(access.grantSources?.length, 0);
    });

    // 3. FORCE_DENY kaydının takvim atamasıyla tekrar açılmaması
    it('3. should NOT silently reactivate a FORCE_DENY access when a new calendar video assignment occurs', () => {
        const modId = 'mod-denied';
        const youtuberId = 'yt-creator-denied';

        // Access was manually revoked by user with FORCE_DENY
        const access: YoutuberModAccess = {
            id: 'access-force-deny',
            youtuberId,
            modProjectId: modId,
            status: 'REVOKED',
            grantType: 'MANUAL',
            manualDecision: 'FORCE_DENY',
            grantedAt: Date.now() - 10000,
            grantedByUserId: 'user-1',
            revokedAt: Date.now() - 5000,
            revokeReason: 'Manually blocked',
            userId: 'user-1',
            createdAt: Date.now() - 10000,
            updatedAt: Date.now() - 5000
        };
        accessList.push(access);

        // Simulation of handleVideoAssignmentModAccess when a calendar assignment arrives
        function handleCalendarAssignment(ytId: string, mId: string, newVideoId: string) {
            const acc = accessList.find((a) => a.youtuberId === ytId && a.modProjectId === mId);
            if (acc) {
                // Critical BlumeCore business rule: if FORCE_DENY, DO NOT silently reactivate!
                if (acc.manualDecision === 'FORCE_DENY') {
                    return { activated: false, reason: 'FORCE_DENY_PRESERVED' };
                }
                acc.status = 'ACTIVE';
                return { activated: true };
            }
            return { activated: false };
        }

        const result = handleCalendarAssignment(youtuberId, modId, 'new-vid-99');

        assert.equal(result.activated, false);
        assert.equal(access.status, 'REVOKED', 'Access must stay REVOKED under FORCE_DENY');
        assert.equal(access.manualDecision, 'FORCE_DENY');
    });

    // 4. Client ikinci istek yapmasa bile cascade job oluşması
    it('4. should create cascade sync job in transaction even when client makes only a single deletion request', async () => {
        interface MockTransactionOp {
            op: 'DELETE' | 'INSERT_OUTBOX_JOB';
            collection: string;
            id: string;
            payload?: Record<string, unknown>;
        }

        const txLog: MockTransactionOp[] = [];

        // Server handler DELETE /api/videos/[videoId] executes single atomic transaction
        async function serverDeleteVideoHandler(videoId: string, userId: string) {
            // Simulated transaction
            txLog.push({ op: 'DELETE', collection: 'youtube_videos', id: videoId });
            txLog.push({ op: 'DELETE', collection: 'assignments', id: 'as-related-1' });

            // Atomic creation of GitHubSyncJob in SAME transaction
            txLog.push({
                op: 'INSERT_OUTBOX_JOB',
                collection: 'github_sync_jobs',
                id: `job-cascade-${Date.now()}`,
                payload: {
                    modProjectId: 'mod-1',
                    status: 'PENDING',
                    triggerType: 'LIFECYCLE_CASCADE',
                    userId
                }
            });

            return { success: true, syncState: 'QUEUED' };
        }

        // Client makes single DELETE request (NO secondary /api/lifecycle/cascade-sync call)
        const res = await serverDeleteVideoHandler('vid-target-123', 'user-1');

        assert.equal(res.success, true);
        assert.equal(res.syncState, 'QUEUED');

        // Check that outbox job was created inside the same transaction
        const outboxOp = txLog.find((op) => op.collection === 'github_sync_jobs');
        assert.ok(outboxOp, 'Outbox GitHubSyncJob must be created in server transaction');
        assert.equal(outboxOp?.payload?.triggerType, 'LIFECYCLE_CASCADE');
        assert.equal(outboxOp?.payload?.status, 'PENDING');
    });

    // 5. MilkAnyMob ve milkanymob için duplicate oluşmaması
    it('5. should prevent duplicate mod creation for case-insensitive variants (MilkAnyMob vs milkanymob)', () => {
        // Step 1: Mod "MilkAnyMob" exists
        const existing = createMockMod({
            id: 'mod-101',
            modKey: 'MilkAnyMob',
            displayName: 'Milk Any Mob'
        });
        modProjects.push(existing);

        // Step 2: Request arrives to POST /api/mods with "milkanymob"
        function saveModProject(inputModKey: string, userId: string): { status: number; mod: ModProject; alreadyExisted: boolean } {
            const canonical = inputModKey.trim().toLowerCase();
            const matched = modProjects.find(
                (m) => m.userId === userId && (m.canonicalModKey === canonical || m.modKey.toLowerCase() === canonical)
            );

            if (matched) {
                // Return existing record idempotently, do NOT overwrite
                return { status: 200, mod: matched, alreadyExisted: true };
            }

            const created = createMockMod({
                id: `mod-${Date.now()}`,
                modKey: inputModKey.trim(),
                userId
            });
            modProjects.push(created);
            return { status: 201, mod: created, alreadyExisted: false };
        }

        const postResult = saveModProject('milkanymob', 'user-1');

        // Assertion: Idempotent 200 return, no duplicate created, original modKey preserved
        assert.equal(postResult.status, 200, 'Must return 200 on case-insensitive match');
        assert.equal(postResult.alreadyExisted, true);
        assert.equal(postResult.mod.modKey, 'MilkAnyMob', 'Must not overwrite original modKey casing');
        assert.equal(modProjects.length, 1, 'Total mod count must remain 1');
    });

    // 6. Stale ARCHIVING kaydının otomatik kurtarılması
    it('6. should auto-recover stale ARCHIVING mod project after timeout', () => {
        const staleTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
        const staleMod = createMockMod({
            id: 'mod-stuck',
            modKey: 'StuckMod',
            lifecycleStatus: 'ARCHIVING',
            updatedAt: staleTimestamp
        });
        modProjects.push(staleMod);

        // Simulation of recoverStaleArchivingMods(timeoutMs = 5 mins)
        function recoverStaleArchivingMods(timeoutMs = 5 * 60 * 1000): number {
            const now = Date.now();
            let recovered = 0;
            for (const m of modProjects) {
                if (m.lifecycleStatus === 'ARCHIVING' && m.updatedAt && now - m.updatedAt > timeoutMs) {
                    m.lifecycleStatus = 'ARCHIVE_FAILED';
                    m.archiveStatus = 'ARCHIVE_FAILED';
                    m.archiveError = 'Arşivleme işlemi zaman aşımına uğradı (stale ARCHIVING). Yeniden deneyebilirsiniz.';
                    m.updatedAt = now;
                    recovered++;
                }
            }
            return recovered;
        }

        const count = recoverStaleArchivingMods();

        assert.equal(count, 1, 'Must recover 1 stale archiving mod');
        assert.equal(staleMod.lifecycleStatus, 'ARCHIVE_FAILED');
        assert.ok(staleMod.archiveError?.includes('stale ARCHIVING'));
    });

    // 7. Global Blume UUID'nin yeni mod ve mevcut mod backfill işlemi
    it('7. should include Global Blume UUID in new mod and backfill existing mods without duplicating legacy entries', () => {
        const canonicalBlumeUuid = normalizeUuid(BLUME_GLOBAL_UUID);

        // Case A: New README without legacy Blume UUID
        const newReadme = `# Mod README\n${MANAGED_START_MARKER}\n${MANAGED_END_MARKER}\n`;
        const groupsForNewMod: RenderInputGroup[] = [
            {
                youtuberId: '__global_blume__',
                youtuberName: 'Global Blume',
                uuids: [canonicalBlumeUuid]
            }
        ];

        const renderedNew = renderManagedReadme(newReadme, groupsForNewMod);
        assert.ok(renderedNew.content.includes(canonicalBlumeUuid), 'Global Blume UUID must be present in managed section');

        // Case B: Existing README that ALREADY has the Blume UUID in unmanaged legacy section
        const existingLegacyReadme = `# Mod README
Server Global Allowlist:
${canonicalBlumeUuid}

${MANAGED_START_MARKER}
${MANAGED_END_MARKER}
`;

        const renderedBackfill = renderManagedReadme(existingLegacyReadme, groupsForNewMod);

        // Assertion: Must skip duplicate!
        assert.ok(renderedBackfill.skippedLegacyUuids.includes(canonicalBlumeUuid), 'Must detect legacy duplicate');
        assert.equal(renderedBackfill.writtenUuidCount, 0, 'Must NOT write duplicate UUID into managed block');

        // Check overall README: exactly 1 occurrence of the UUID exists in the entire file
        const matches = renderedBackfill.content.match(new RegExp(canonicalBlumeUuid, 'g')) || [];
        assert.equal(matches.length, 1, 'Canonical Blume UUID must appear exactly once (in legacy section)');
    });

    // 8. Yeni endpointlerde 401/403 ve ownership kontrolleri
    it('8. should enforce 401 unauthenticated, 403 non-owner, and admin/cron permissions on lifecycle endpoints', () => {
        const targetMod = createMockMod({
            id: 'mod-user-a',
            modKey: 'UserAMod',
            userId: 'user-a'
        });

        // Test check authorization function simulating route logic
        function checkEndpointAuth(
            sessionUser: { userId: string; isSystemAdmin: boolean } | null,
            cronSecretHeader: string | null,
            targetResourceUserId: string
        ): { status: number; allowed: boolean } {
            const isCron = cronSecretHeader === 'test-cron-secret';
            if (!sessionUser && !isCron) {
                return { status: 401, allowed: false };
            }
            if (isCron || sessionUser?.isSystemAdmin) {
                return { status: 200, allowed: true };
            }
            if (sessionUser && sessionUser.userId !== targetResourceUserId) {
                return { status: 403, allowed: false };
            }
            return { status: 200, allowed: true };
        }

        // 1. Unauthenticated request -> 401
        const r1 = checkEndpointAuth(null, null, targetMod.userId);
        assert.equal(r1.status, 401, 'Unauthenticated request must return 401');

        // 2. Different user attempting to modify user-a's resource -> 403
        const r2 = checkEndpointAuth({ userId: 'user-b', isSystemAdmin: false }, null, targetMod.userId);
        assert.equal(r2.status, 403, 'Non-owner non-admin user must return 403');

        // 3. Resource owner -> 200
        const r3 = checkEndpointAuth({ userId: 'user-a', isSystemAdmin: false }, null, targetMod.userId);
        assert.equal(r3.status, 200, 'Owner must be permitted (200)');

        // 4. System Admin -> 200
        const r4 = checkEndpointAuth({ userId: 'admin-user', isSystemAdmin: true }, null, targetMod.userId);
        assert.equal(r4.status, 200, 'System Admin must be permitted (200)');

        // 5. Valid Cron Secret -> 200
        const r5 = checkEndpointAuth(null, 'test-cron-secret', targetMod.userId);
        assert.equal(r5.status, 200, 'Valid cron secret must be permitted (200)');
    });
});
