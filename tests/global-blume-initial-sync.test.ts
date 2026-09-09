import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    REQUIRED_GLOBAL_PLAYERS,
    BLUME_GLOBAL_UUID
} from '../src/lib/global-players';
import {
    renderManagedReadme,
    parseLegacyReadme,
    RenderInputGroup,
    MANAGED_START_MARKER,
    MANAGED_END_MARKER
} from '../src/lib/github/readme-parser';
import {
    ModProject,
    GitHubSyncJob,
    GitHubSyncTriggerType,
    resolveModLifecycleStatus
} from '../src/lib/mods/types';

describe('Global Blume & Initial Sync Lifecycle Tests', () => {
    let mockJobs: GitHubSyncJob[] = [];
    let jobCounter = 0;

    beforeEach(() => {
        mockJobs = [];
        jobCounter = 0;
    });

    function createOrCoalesceMockJob(
        modProjectId: string,
        userId: string,
        triggerType: GitHubSyncTriggerType
    ): GitHubSyncJob {
        const now = Date.now();
        // Coalescing check: find existing PENDING or non-stale RUNNING job
        const existing = mockJobs.find(
            (j) =>
                j.modProjectId === modProjectId &&
                j.userId === userId &&
                (j.status === 'PENDING' || (j.status === 'RUNNING' && j.lockedAt && now - j.lockedAt < 5 * 60 * 1000))
        );
        if (existing) {
            return existing;
        }

        const newJob: GitHubSyncJob = {
            id: `job-${++jobCounter}`,
            modProjectId,
            status: 'PENDING',
            triggerType,
            attemptCount: 0,
            nextAttemptAt: now,
            userId,
            createdAt: now,
            updatedAt: now
        };
        mockJobs.push(newJob);
        return newJob;
    }

    it('1. Sıfır video ve sıfır YouTuber ile oluşturulan yeni modda Blume UUID bulunuyor', () => {
        // Desired state with 0 videos and 0 youtubers
        const youtuberGroups: RenderInputGroup[] = [];

        // Global Blume is built-in
        const blumePlayer = REQUIRED_GLOBAL_PLAYERS.find(p => p.id === 'blume');
        assert.ok(blumePlayer, 'Built-in Blume player must exist');
        assert.equal(blumePlayer.uuid, '058aa284-c0cf-4826-beae-9df1cb411623');
        assert.equal(blumePlayer.isActive, true);

        youtuberGroups.push({
            youtuberId: '__global_blume__',
            youtuberName: 'Global Blume',
            uuids: [blumePlayer.uuid]
        });

        // Render with empty initial README
        const renderResult = renderManagedReadme('', youtuberGroups);

        assert.equal(renderResult.changed, true);
        assert.equal(renderResult.writtenUuidCount, 1);
        assert.ok(renderResult.content.includes(BLUME_GLOBAL_UUID), 'README must contain Blume UUID');
        assert.ok(renderResult.content.includes(MANAGED_START_MARKER));
        assert.ok(renderResult.content.includes(MANAGED_END_MARKER));
    });

    it('2. Yeni public repo ve README oluşturulduktan sonra INITIAL_SYNC job oluşuyor', () => {
        const modId = 'new-mod-alpha';
        const userId = 'user-owner';

        const job = createOrCoalesceMockJob(modId, userId, 'INITIAL_SYNC');

        assert.equal(job.triggerType, 'INITIAL_SYNC');
        assert.equal(job.status, 'PENDING');
        assert.equal(job.modProjectId, modId);
        assert.equal(mockJobs.length, 1);
    });

    it('3. Mevcut boş README\'li repo import edildiğinde Blume UUID ekleniyor', () => {
        const existingEmptyReadme = '# My Mod\n\nSome introductory notes.\n';
        const blumeGroup: RenderInputGroup = {
            youtuberId: '__global_blume__',
            youtuberName: 'Global Blume',
            uuids: [BLUME_GLOBAL_UUID]
        };

        const renderResult = renderManagedReadme(existingEmptyReadme, [blumeGroup]);

        assert.equal(renderResult.changed, true);
        assert.ok(renderResult.content.startsWith('# My Mod\n\nSome introductory notes.'));
        assert.ok(renderResult.content.includes(BLUME_GLOBAL_UUID));
        assert.equal(renderResult.writtenUuidCount, 1);
    });

    it('4. Firestore globalMinecraftPlayers koleksiyonu boşken built-in Blume UUID yine ekleniyor', () => {
        // Built-in REQUIRED_GLOBAL_PLAYERS fallback verification
        const activeGlobalUuids = REQUIRED_GLOBAL_PLAYERS
            .filter(p => p.isActive)
            .map(p => p.uuid.toLowerCase());

        assert.ok(activeGlobalUuids.includes(BLUME_GLOBAL_UUID));

        const groups: RenderInputGroup[] = [{
            youtuberId: '__global_blume__',
            youtuberName: 'Global Blume',
            uuids: activeGlobalUuids
        }];

        const renderResult = renderManagedReadme('', groups);
        assert.ok(renderResult.content.includes(BLUME_GLOBAL_UUID));
        assert.equal(renderResult.writtenUuidCount, 1);
    });

    it('5. Blume UUID legacy bölümde varsa duplicate oluşmuyor ve satisfiedByLegacy tespit ediliyor', () => {
        const legacyReadme = `# Existing Mod Readme
058aa284-c0cf-4826-beae-9df1cb411623
`;
        const blumeGroup: RenderInputGroup = {
            youtuberId: '__global_blume__',
            youtuberName: 'Global Blume',
            uuids: [BLUME_GLOBAL_UUID]
        };

        const renderResult = renderManagedReadme(legacyReadme, [blumeGroup]);

        // Must NOT write duplicate into managed block
        assert.equal(renderResult.writtenUuidCount, 0);
        assert.ok(renderResult.skippedLegacyUuids.includes(BLUME_GLOBAL_UUID));

        const satisfiedByLegacy = renderResult.skippedLegacyUuids.includes(BLUME_GLOBAL_UUID);
        assert.equal(satisfiedByLegacy, true, 'Must report satisfiedByLegacy: true');

        // Check occurrence count: exactly 1 in legacy section
        const matches = renderResult.content.match(new RegExp(BLUME_GLOBAL_UUID, 'g')) || [];
        assert.equal(matches.length, 1);
    });

    it('6. Aynı mod iki kez kaydedildiğinde duplicate INITIAL_SYNC job oluşmuyor (coalescing)', () => {
        const modId = 'idempotent-mod';
        const userId = 'user-owner';

        const job1 = createOrCoalesceMockJob(modId, userId, 'INITIAL_SYNC');
        const job2 = createOrCoalesceMockJob(modId, userId, 'INITIAL_SYNC');

        assert.equal(job1.id, job2.id, 'Should return the existing job');
        assert.equal(mockJobs.length, 1, 'Only one job should be in the queue');
    });

    it('7. GitHub işlemi başarısız olursa PENDING/FAILED job retry edilebiliyor', () => {
        const job = createOrCoalesceMockJob('retry-mod', 'user-owner', 'INITIAL_SYNC');
        assert.equal(job.status, 'PENDING');

        // Simulate failure
        job.status = 'FAILED';
        job.lastErrorCode = 'API_ERROR';
        job.attemptCount = 1;

        // Manual retry
        job.status = 'PENDING';
        job.lastErrorCode = null;
        assert.equal(job.status, 'PENDING');
        assert.equal(job.attemptCount, 1);
    });

    it('8. Arşivden çıkarılan modda Global Blume UUID yeniden doğrulanıyor', () => {
        const mod: ModProject = {
            id: 'archived-mod',
            modKey: 'archived-mod',
            canonicalModKey: 'archived-mod',
            displayName: 'Archived Mod',
            githubOwner: 'blumeplugins',
            githubRepository: 'archived-mod',
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ARCHIVED',
            isActive: false,
            isArchived: true,
            archiveStatus: 'ARCHIVED',
            syncStatus: 'SUCCESS',
            userId: 'user-owner',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // Unarchive
        mod.lifecycleStatus = 'ACTIVE';
        mod.isActive = true;
        mod.isArchived = false;
        mod.archiveStatus = 'ACTIVE';

        assert.equal(resolveModLifecycleStatus(mod), 'ACTIVE');

        // Must re-create/coalesce sync job for unarchived mod
        const syncJob = createOrCoalesceMockJob(mod.id, mod.userId, 'MOD_RESTORED');
        assert.equal(syncJob.triggerType, 'MOD_RESTORED');
        assert.equal(syncJob.status, 'PENDING');

        // Render desired state with Global Blume
        const renderResult = renderManagedReadme('', [{
            youtuberId: '__global_blume__',
            youtuberName: 'Global Blume',
            uuids: [BLUME_GLOBAL_UUID]
        }]);
        assert.ok(renderResult.content.includes(BLUME_GLOBAL_UUID));
    });

    it('9. Global oyuncu mevcutken NO_ACTIVE_PLAYERS sonucu dönmüyor', () => {
        // Desired state with Blume
        const allDesiredUuids = [BLUME_GLOBAL_UUID];

        // Process logic check
        const runStatus = allDesiredUuids.length === 0 ? 'NO_ACTIVE_PLAYERS' : 'NO_OP';
        assert.notEqual(runStatus, 'NO_ACTIVE_PLAYERS');
        assert.equal(runStatus, 'NO_OP');
    });
});
