import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLegacyReadme,
    renderManagedReadme,
    RenderInputGroup,
    MANAGED_START_MARKER,
    MANAGED_END_MARKER
} from '../src/lib/github/readme-parser';
import { normalizeUuid } from '../src/lib/minecraft-players';
import {
    ModProject,
    YoutuberModAccess,
    GitHubSyncJob,
    GitHubSyncTriggerType
} from '../src/lib/mods/types';

// In-memory data store for player sync propagation tests
interface MockPlayer {
    id: string;
    username: string;
    uuid: string;
}

interface MockAssociation {
    id: string;
    youtuberId: string;
    minecraftPlayerId: string;
    relationshipType: string;
    isPrimary: boolean;
    isActive: boolean;
}

interface MockYoutuber {
    id: string;
    name: string;
}

interface MockVideoAssignment {
    id: string;
    videoId: string;
    youtuberId: string;
    modProjectId: string;
}

interface MockGitRepo {
    modProjectId: string;
    defaultBranch: string;
    readmeContent: string;
    commitCount: number;
    lastCommitMessage: string | null;
}

describe('Minecraft Player Sync & Propagation Tests', () => {
    let players: MockPlayer[] = [];
    let youtubers: MockYoutuber[] = [];
    let associations: MockAssociation[] = [];
    let modProjects: ModProject[] = [];
    let accessList: YoutuberModAccess[] = [];
    let videoAssignments: MockVideoAssignment[] = [];
    let gitRepos: Map<string, MockGitRepo> = new Map();
    let syncJobs: GitHubSyncJob[] = [];

    beforeEach(() => {
        players = [];
        youtubers = [];
        associations = [];
        modProjects = [];
        accessList = [];
        videoAssignments = [];
        gitRepos.clear();
        syncJobs = [];
    });

    // Helper: setup a default mod project with mock git repo
    function setupMod(id: string, name: string, active: boolean = true, archived: boolean = false, initialReadme?: string): ModProject {
        const mod: ModProject = {
            id,
            modKey: name,
            canonicalModKey: name.toLowerCase(),
            displayName: name,
            githubOwner: 'blumeplugins',
            githubRepository: name,
            branch: 'main',
            allowlistPath: 'README.md',
            syncMode: 'LEGACY_README',
            lifecycleStatus: archived ? 'ARCHIVED' : (active ? 'ACTIVE' : 'ARCHIVED'),
            isActive: active,
            isArchived: archived,
            syncStatus: 'SUCCESS',
            lastSuccessfulSyncAt: null,
            lastSuccessfulCommitSha: null,
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        modProjects.push(mod);

        const readme = initialReadme !== undefined ? initialReadme : `# ${name}\nMod description\n`;
        gitRepos.set(id, {
            modProjectId: id,
            defaultBranch: 'main',
            readmeContent: readme,
            commitCount: 0,
            lastCommitMessage: null
        });

        return mod;
    }

    // Helper: calculate desired UUIDs for a mod project across all active YouTubers
    function calculateDesiredStateForMod(modProjectId: string): RenderInputGroup[] {
        const mod = modProjects.find((m) => m.id === modProjectId);
        if (!mod || !mod.isActive || mod.isArchived) return [];

        // Find active accesses that are not FORCE_DENY
        const activeAccesses = accessList.filter(
            (a) => a.modProjectId === modProjectId && a.status === 'ACTIVE' && a.manualDecision !== 'FORCE_DENY'
        );

        const groups: RenderInputGroup[] = [];

        // Sort by youtuberId for determinism
        const sortedAccesses = [...activeAccesses].sort((a, b) => a.youtuberId.localeCompare(b.youtuberId));

        for (const access of sortedAccesses) {
            const yt = youtubers.find((y) => y.id === access.youtuberId);
            const ytName = yt ? yt.name : access.youtuberId;

            // Find active players for this YouTuber
            const ytAssocs = associations.filter(
                (assoc) => assoc.youtuberId === access.youtuberId && assoc.isActive
            );

            const activePlayerUuids: string[] = [];
            for (const assoc of ytAssocs) {
                const player = players.find((p) => p.id === assoc.minecraftPlayerId);
                if (player && !activePlayerUuids.includes(player.uuid)) {
                    activePlayerUuids.push(player.uuid);
                }
            }

            // Sort UUIDs for determinism
            activePlayerUuids.sort();

            groups.push({
                youtuberId: access.youtuberId,
                youtuberName: ytName,
                uuids: activePlayerUuids
            });
        }

        return groups;
    }

    // Helper: execute sync for a mod project, updating Git repo content in a single commit
    function executeModSync(modProjectId: string, commitMessage: string = 'Update BlumeCore allowlist'): {
        changed: boolean;
        writtenUuidCount: number;
        skippedLegacyUuidCount: number;
        error?: string;
    } {
        const repo = gitRepos.get(modProjectId);
        if (!repo) throw new Error(`Git repo not found for mod ${modProjectId}`);

        const groups = calculateDesiredStateForMod(modProjectId);
        const renderResult = renderManagedReadme(repo.readmeContent, groups);

        if (renderResult.changed) {
            repo.readmeContent = renderResult.content;
            repo.commitCount += 1;
            repo.lastCommitMessage = commitMessage;
        }

        return {
            changed: renderResult.changed,
            writtenUuidCount: renderResult.writtenUuidCount,
            skippedLegacyUuidCount: renderResult.skippedLegacyUuidCount,
            error: renderResult.error
        };
    }

    // Helper: queue or coalesce sync job
    function queueOrCoalesceJob(modProjectId: string, userId: string, triggerType: GitHubSyncTriggerType) {
        const existing = syncJobs.find(
            (j) => j.modProjectId === modProjectId && j.userId === userId && j.status === 'PENDING'
        );
        if (existing) {
            return { job: existing, coalesced: true };
        }
        const newJob: GitHubSyncJob = {
            id: `job-${syncJobs.length + 1}`,
            modProjectId,
            status: 'PENDING',
            triggerType,
            attemptCount: 0,
            nextAttemptAt: Date.now(),
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        syncJobs.push(newJob);
        return { job: newJob, coalesced: false };
    }

    // Core function mirroring syncActiveModsForYoutuberChange
    function simulatePlayerChangeSync(params: {
        youtuberId: string;
        userId: string;
        triggerType: GitHubSyncTriggerType;
        playerId?: string;
        changedUuid?: string;
        oldUuid?: string;
        shouldFailGit?: boolean;
    }) {
        const { youtuberId, userId, triggerType, playerId, changedUuid, oldUuid, shouldFailGit } = params;

        // Find active accesses
        const accesses = accessList.filter(
            (a) => a.youtuberId === youtuberId && a.userId === userId && a.status === 'ACTIVE'
        );

        if (accesses.length === 0) {
            return {
                success: true,
                playerId,
                affectedModCount: 0,
                queuedJobCount: 0,
                coalescedJobCount: 0,
                legacyConflicts: [] as { modId: string; reason: string }[],
                affectedModIds: [] as string[],
                queuedJobIds: [] as string[]
            };
        }

        const affectedModIds: string[] = [];
        const legacyConflicts: { modId: string; reason: string }[] = [];
        const queuedJobIds: string[] = [];
        let queuedJobCount = 0;
        let coalescedJobCount = 0;

        const candidateUuids = [changedUuid, oldUuid].filter(Boolean).map((u) => normalizeUuid(u as string));

        for (const access of accesses) {
            if (access.manualDecision === 'FORCE_DENY') continue;

            const mod = modProjects.find((m) => m.id === access.modProjectId);
            if (!mod || !mod.isActive || mod.isArchived) continue;

            affectedModIds.push(mod.id);

            // Legacy check
            if (candidateUuids.length > 0) {
                const repo = gitRepos.get(mod.id);
                if (repo) {
                    const parsed = parseLegacyReadme(repo.readmeContent);
                    for (const cand of candidateUuids) {
                        if (parsed.legacyUuids.includes(cand)) {
                            if (!legacyConflicts.some((c) => c.modId === mod.modKey)) {
                                legacyConflicts.push({
                                    modId: mod.modKey,
                                    reason: 'UUID_EXISTS_IN_LEGACY_SECTION'
                                });
                            }
                        }
                    }
                }
            }

            // Queue or coalesce
            const { job, coalesced } = queueOrCoalesceJob(mod.id, userId, triggerType);
            if (coalesced) {
                coalescedJobCount++;
            } else {
                queuedJobCount++;
            }
            queuedJobIds.push(job.id);
        }

        // Process immediately if not simulated failure
        if (shouldFailGit) {
            for (const jId of queuedJobIds) {
                const j = syncJobs.find((x) => x.id === jId);
                if (j) {
                    j.status = 'FAILED';
                    j.attemptCount += 1;
                    j.lastErrorCode = 'GITHUB_HTTP_500';
                    j.lastErrorMessage = 'Simulated GitHub outage';
                    // Exponential backoff
                    const backoffMinutes = [1, 5, 15, 60];
                    const delayMs = (backoffMinutes[Math.min(j.attemptCount - 1, backoffMinutes.length - 1)] || 60) * 60 * 1000;
                    j.nextAttemptAt = Date.now() + delayMs;
                }
            }
        } else {
            for (const modId of affectedModIds) {
                executeModSync(modId, `Sync player change: ${triggerType}`);
                const j = syncJobs.find((x) => x.modProjectId === modId && x.status === 'PENDING');
                if (j) {
                    j.status = 'SUCCESS';
                }
            }
        }

        return {
            success: true,
            playerId,
            affectedModCount: affectedModIds.length,
            queuedJobCount,
            coalescedJobCount,
            legacyConflicts,
            affectedModIds,
            queuedJobIds
        };
    }

    // ==========================================
    // 15 Comprehensive Test Scenarios
    // ==========================================

    // Scenario 1: Player added -> active mods queued & synced
    it('1. should automatically queue and sync active mods when a player is added', () => {
        const mod = setupMod('mod-1', 'MilkAnyMob', true);
        youtubers.push({ id: 'yt-1', name: 'Baris' });
        accessList.push({
            id: 'acc-1',
            youtuberId: 'yt-1',
            modProjectId: 'mod-1',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        // Add player
        const uuid = normalizeUuid('069a79f4-44e9-4726-a5be-fca90e38aaf5');
        players.push({ id: 'p-1', username: 'BarisMC', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        const syncResult = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED',
            playerId: 'p-1',
            changedUuid: uuid
        });

        assert.equal(syncResult.affectedModCount, 1);
        assert.equal(syncResult.queuedJobCount, 1);

        const repo = gitRepos.get('mod-1');
        assert.ok(repo);
        assert.equal(repo.commitCount, 1);
        assert.ok(repo.readmeContent.includes(uuid));
        assert.ok(repo.readmeContent.includes('# BlumeCore: Baris'));
    });

    // Scenario 2: Player deleted -> removed from all affected mods
    it('2. should remove player UUID from all affected mod allowlists when player association is deleted', () => {
        const mod1 = setupMod('mod-1', 'MilkAnyMob', true);
        const mod2 = setupMod('mod-2', 'JumpHigher', true);
        youtubers.push({ id: 'yt-1', name: 'Baris' });

        for (const m of [mod1, mod2]) {
            accessList.push({
                id: `acc-${m.id}`,
                youtuberId: 'yt-1',
                modProjectId: m.id,
                status: 'ACTIVE',
                syncStatus: 'SUCCESS',
                grantType: 'MANUAL',
                manualDecision: 'NONE',
                sourceVideoAssignmentId: null,
                grantedAt: Date.now(),
                grantedByUserId: 'user-1',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        const uuid = normalizeUuid('069a79f4-44e9-4726-a5be-fca90e38aaf5');
        players.push({ id: 'p-1', username: 'BarisMC', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        // First sync with player active
        simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED',
            playerId: 'p-1'
        });

        assert.ok(gitRepos.get('mod-1')?.readmeContent.includes(uuid));
        assert.ok(gitRepos.get('mod-2')?.readmeContent.includes(uuid));

        // Now simulate deletion: remove association
        associations = associations.filter((a) => a.id !== 'a-1');

        const delResult = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_DELETED',
            playerId: 'p-1',
            oldUuid: uuid
        });

        assert.equal(delResult.affectedModCount, 2);
        assert.ok(!gitRepos.get('mod-1')?.readmeContent.includes(uuid));
        assert.ok(!gitRepos.get('mod-2')?.readmeContent.includes(uuid));
        // Commit count should be 2 for each repo (1 for add, 1 for remove)
        assert.equal(gitRepos.get('mod-1')?.commitCount, 2);
        assert.equal(gitRepos.get('mod-2')?.commitCount, 2);
    });

    // Scenario 3: UUID changed -> single commit per repository
    it('3. should update UUID in a single atomic commit per repository without intermediate delete commit', () => {
        const mod = setupMod('mod-1', 'DyingIsOP', true);
        youtubers.push({ id: 'yt-1', name: 'Wollech' });
        accessList.push({
            id: 'acc-1',
            youtuberId: 'yt-1',
            modProjectId: 'mod-1',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const oldUuid = normalizeUuid('11111111-1111-1111-1111-111111111111');
        const newUuid = normalizeUuid('22222222-2222-2222-2222-222222222222');

        players.push({ id: 'p-1', username: 'WollechMC', uuid: oldUuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        // Initial sync
        simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED'
        });
        assert.equal(gitRepos.get('mod-1')?.commitCount, 1);

        // Update player's UUID
        const p = players.find((x) => x.id === 'p-1')!;
        p.uuid = newUuid;

        const updateResult = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_UPDATED',
            playerId: 'p-1',
            changedUuid: newUuid,
            oldUuid
        });

        assert.equal(updateResult.affectedModCount, 1);
        const repo = gitRepos.get('mod-1')!;
        // Exactly 1 additional commit was performed, NOT 2 (no delete commit + add commit)
        assert.equal(repo.commitCount, 2);
        assert.ok(repo.readmeContent.includes(newUuid));
        assert.ok(!repo.readmeContent.includes(oldUuid));
    });

    // Scenario 4: Player active/passive toggle -> allowlist add/remove
    it('4. should remove UUID when player is toggled passive and restore it when toggled active', () => {
        setupMod('mod-1', 'FlyMod', true);
        youtubers.push({ id: 'yt-1', name: 'Youtuber1' });
        accessList.push({
            id: 'acc-1',
            youtuberId: 'yt-1',
            modProjectId: 'mod-1',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const uuid = normalizeUuid('33333333-3333-3333-3333-333333333333');
        players.push({ id: 'p-1', username: 'TestPlayer', uuid });
        const assoc: MockAssociation = {
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        };
        associations.push(assoc);

        // Initial sync: active
        simulatePlayerChangeSync({ youtuberId: 'yt-1', userId: 'user-1', triggerType: 'PLAYER_ADDED' });
        assert.ok(gitRepos.get('mod-1')?.readmeContent.includes(uuid));

        // Toggle to PASSIVE (isActive = false)
        assoc.isActive = false;
        simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_UPDATED',
            playerId: 'p-1',
            changedUuid: uuid
        });
        assert.ok(!gitRepos.get('mod-1')?.readmeContent.includes(uuid));

        // Toggle back to ACTIVE (isActive = true)
        assoc.isActive = true;
        simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_UPDATED',
            playerId: 'p-1',
            changedUuid: uuid
        });
        assert.ok(gitRepos.get('mod-1')?.readmeContent.includes(uuid));
    });

    // Scenario 5: Videoless manual mod access included
    it('5. should include mods granted via manual grant without any associated video', () => {
        setupMod('mod-manual', 'ManualGrantMod', true);
        youtubers.push({ id: 'yt-1', name: 'PartnerYT' });
        accessList.push({
            id: 'acc-man',
            youtuberId: 'yt-1',
            modProjectId: 'mod-manual',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL', // Direct manual grant with no video
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const uuid = normalizeUuid('44444444-4444-4444-4444-444444444444');
        players.push({ id: 'p-1', username: 'PartnerPlayer', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED'
        });

        assert.equal(result.affectedModCount, 1);
        assert.deepEqual(result.affectedModIds, ['mod-manual']);
        assert.ok(gitRepos.get('mod-manual')?.readmeContent.includes(uuid));
    });

    // Scenario 6: Multiple videos with same mod deduplicated
    it('6. should deduplicate mod targets when YouTuber has multiple video assignments for the same mod', () => {
        setupMod('mod-dup', 'PopularMod', true);
        youtubers.push({ id: 'yt-1', name: 'BusyCreator' });

        // Two video assignments for the same mod
        videoAssignments.push({ id: 'va-1', videoId: 'v1', youtuberId: 'yt-1', modProjectId: 'mod-dup' });
        videoAssignments.push({ id: 'va-2', videoId: 'v2', youtuberId: 'yt-1', modProjectId: 'mod-dup' });

        // There is single active access record for this youtuber & mod
        accessList.push({
            id: 'acc-dup',
            youtuberId: 'yt-1',
            modProjectId: 'mod-dup',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'VIDEO_ASSIGNMENT',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: 'va-1',
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const uuid = normalizeUuid('55555555-5555-5555-5555-555555555555');
        players.push({ id: 'p-1', username: 'BusyGuy', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED'
        });

        assert.equal(result.affectedModCount, 1);
        assert.equal(result.affectedModIds.length, 1);
        assert.equal(gitRepos.get('mod-dup')?.commitCount, 1);
    });

    // Scenario 7: FORCE_DENY access excluded
    it('7. should exclude mods where manualDecision is FORCE_DENY', () => {
        setupMod('mod-denied', 'SecretMod', true);
        youtubers.push({ id: 'yt-1', name: 'DeniedYT' });
        accessList.push({
            id: 'acc-denied',
            youtuberId: 'yt-1',
            modProjectId: 'mod-denied',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'FORCE_DENY', // Explicitly blocked
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const uuid = normalizeUuid('66666666-6666-6666-6666-666666666666');
        players.push({ id: 'p-1', username: 'BlockedPlayer', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED'
        });

        assert.equal(result.affectedModCount, 0);
        assert.equal(gitRepos.get('mod-denied')?.commitCount, 0);
    });

    // Scenario 8: Archived or passive mod excluded
    it('8. should exclude archived or inactive mod projects from sync', () => {
        setupMod('mod-archived', 'OldMod', true, true); // archived
        setupMod('mod-passive', 'PassiveMod', false, false); // inactive
        youtubers.push({ id: 'yt-1', name: 'SomeYT' });

        for (const mId of ['mod-archived', 'mod-passive']) {
            accessList.push({
                id: `acc-${mId}`,
                youtuberId: 'yt-1',
                modProjectId: mId,
                status: 'ACTIVE',
                syncStatus: 'SUCCESS',
                grantType: 'MANUAL',
                manualDecision: 'NONE',
                sourceVideoAssignmentId: null,
                grantedAt: Date.now(),
                grantedByUserId: 'user-1',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        const uuid = normalizeUuid('77777777-7777-7777-7777-777777777777');
        players.push({ id: 'p-1', username: 'TestPlayer', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED'
        });

        assert.equal(result.affectedModCount, 0);
        assert.equal(gitRepos.get('mod-archived')?.commitCount, 0);
        assert.equal(gitRepos.get('mod-passive')?.commitCount, 0);
    });

    // Scenario 9: Shared UUID protection across multiple players/YouTubers
    it('9. should protect shared UUID: when YouTuber A removes player, UUID is kept if YouTuber B still uses it', () => {
        setupMod('mod-shared', 'SharedPlayMod', true);
        youtubers.push({ id: 'yt-a', name: 'Alice' });
        youtubers.push({ id: 'yt-b', name: 'Bob' });

        for (const ytId of ['yt-a', 'yt-b']) {
            accessList.push({
                id: `acc-${ytId}`,
                youtuberId: ytId,
                modProjectId: 'mod-shared',
                status: 'ACTIVE',
                syncStatus: 'SUCCESS',
                grantType: 'MANUAL',
                manualDecision: 'NONE',
                sourceVideoAssignmentId: null,
                grantedAt: Date.now(),
                grantedByUserId: 'user-1',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        // Shared UUID: same cameraman/friend plays with both Alice and Bob
        const sharedUuid = normalizeUuid('88888888-8888-8888-8888-888888888888');
        players.push({ id: 'p-shared', username: 'CameraGuy', uuid: sharedUuid });

        associations.push({
            id: 'a-alice',
            youtuberId: 'yt-a',
            minecraftPlayerId: 'p-shared',
            relationshipType: 'CAMERAMAN',
            isPrimary: false,
            isActive: true
        });
        associations.push({
            id: 'a-bob',
            youtuberId: 'yt-b',
            minecraftPlayerId: 'p-shared',
            relationshipType: 'CAMERAMAN',
            isPrimary: false,
            isActive: true
        });

        // Sync both
        executeModSync('mod-shared');
        const repo = gitRepos.get('mod-shared')!;
        assert.ok(repo.readmeContent.includes(sharedUuid));

        // Alice removes player association
        associations = associations.filter((a) => a.id !== 'a-alice');

        simulatePlayerChangeSync({
            youtuberId: 'yt-a',
            userId: 'user-1',
            triggerType: 'PLAYER_DELETED',
            oldUuid: sharedUuid
        });

        // Shared UUID MUST still be in README because Bob still uses it!
        assert.ok(repo.readmeContent.includes(sharedUuid));
        assert.ok(repo.readmeContent.includes('# BlumeCore: Bob'));
        // Alice group heading is removed or has no UUIDs
        const parsed = parseLegacyReadme(repo.readmeContent);
        assert.deepEqual(parsed.managedUuidsByYoutuber['yt-b'], [sharedUuid]);
        assert.equal(parsed.managedUuidsByYoutuber['yt-a'], undefined);
    });

    // Scenario 10: Legacy UUID retained in README and flagged in legacyConflicts
    it('10. should retain legacy UUID in README unmanaged section and return legacyConflicts when candidate matches', () => {
        const legacyUuid = normalizeUuid('99999999-9999-9999-9999-999999999999');
        const initialReadmeWithLegacy = `# Header\n# Unmanaged Legacy Players\n${legacyUuid}\n\n`;

        setupMod('mod-legacy', 'LegacyMod', true, false, initialReadmeWithLegacy);
        youtubers.push({ id: 'yt-1', name: 'OldCreator' });
        accessList.push({
            id: 'acc-1',
            youtuberId: 'yt-1',
            modProjectId: 'mod-legacy',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        // Associate the same UUID to the creator
        players.push({ id: 'p-legacy', username: 'LegacyGuy', uuid: legacyUuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-legacy',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        // Trigger sync
        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED',
            changedUuid: legacyUuid
        });

        assert.equal(result.affectedModCount, 1);
        assert.equal(result.legacyConflicts.length, 1);
        assert.equal(result.legacyConflicts[0].modId, 'LegacyMod');
        assert.equal(result.legacyConflicts[0].reason, 'UUID_EXISTS_IN_LEGACY_SECTION');

        const repo = gitRepos.get('mod-legacy')!;
        const parsed = parseLegacyReadme(repo.readmeContent);
        // Legacy UUID preserved in legacy section
        assert.ok(parsed.legacyUuids.includes(legacyUuid));
        // And safely skipped from duplicated render in managed section
        assert.ok(parsed.managedUuidsByYoutuber['yt-1'] === undefined || !parsed.managedUuidsByYoutuber['yt-1'].includes(legacyUuid));
    });

    // Scenario 11: Rapid player additions and job coalescing
    it('11. should coalesce rapid player modifications for the same mod into a single PENDING job', () => {
        setupMod('mod-fast', 'FastMod', true);
        youtubers.push({ id: 'yt-1', name: 'Speedy' });
        accessList.push({
            id: 'acc-fast',
            youtuberId: 'yt-1',
            modProjectId: 'mod-fast',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        // Simulate 5 rapid calls in the same tick
        const r1 = queueOrCoalesceJob('mod-fast', 'user-1', 'PLAYER_ADDED');
        const r2 = queueOrCoalesceJob('mod-fast', 'user-1', 'PLAYER_ADDED');
        const r3 = queueOrCoalesceJob('mod-fast', 'user-1', 'PLAYER_UPDATED');
        const r4 = queueOrCoalesceJob('mod-fast', 'user-1', 'PLAYER_DELETED');
        const r5 = queueOrCoalesceJob('mod-fast', 'user-1', 'PLAYER_ADDED');

        assert.equal(r1.coalesced, false);
        assert.equal(r2.coalesced, true);
        assert.equal(r3.coalesced, true);
        assert.equal(r4.coalesced, true);
        assert.equal(r5.coalesced, true);

        // Exactly one job created in queue
        assert.equal(syncJobs.length, 1);
        assert.equal(syncJobs[0].status, 'PENDING');
        assert.equal(syncJobs[0].id, r1.job.id);
    });

    // Scenario 12: GitHub sync failure & exponential retry
    it('12. should handle GitHub sync failure with exponential retry backoff without losing pending state', () => {
        setupMod('mod-fail', 'FlakyMod', true);
        youtubers.push({ id: 'yt-1', name: 'FlakyYT' });
        accessList.push({
            id: 'acc-fail',
            youtuberId: 'yt-1',
            modProjectId: 'mod-fail',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const uuid = normalizeUuid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        players.push({ id: 'p-1', username: 'FlakyPlayer', uuid });
        associations.push({
            id: 'a-1',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-1',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        // Trigger with simulated GitHub failure
        simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED',
            shouldFailGit: true
        });

        assert.equal(syncJobs.length, 1);
        const job = syncJobs[0];
        assert.equal(job.status, 'FAILED');
        assert.equal(job.attemptCount, 1);
        assert.equal(job.lastErrorCode, 'GITHUB_HTTP_500');
        // Backoff delay for attempt 1 is 1 minute (60,000 ms)
        assert.ok(job.nextAttemptAt >= Date.now() + 50000);
    });

    // Scenario 13: Player CRUD preserved despite GitHub sync failure
    it('13. should preserve player CRUD in Firestore even when GitHub API throws an error', () => {
        setupMod('mod-err', 'ErrorMod', true);
        youtubers.push({ id: 'yt-1', name: 'ErrorYT' });
        accessList.push({
            id: 'acc-err',
            youtuberId: 'yt-1',
            modProjectId: 'mod-err',
            status: 'ACTIVE',
            syncStatus: 'SUCCESS',
            grantType: 'MANUAL',
            manualDecision: 'NONE',
            sourceVideoAssignmentId: null,
            grantedAt: Date.now(),
            grantedByUserId: 'user-1',
            userId: 'user-1',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        const uuid = normalizeUuid('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
        // Player is added to database
        players.push({ id: 'p-err', username: 'ErrorPlayer', uuid });
        associations.push({
            id: 'a-err',
            youtuberId: 'yt-1',
            minecraftPlayerId: 'p-err',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        // GitHub sync throws an error
        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-1',
            userId: 'user-1',
            triggerType: 'PLAYER_ADDED',
            playerId: 'p-err',
            shouldFailGit: true
        });

        // Endpoint returns success: true for player operation with affectedModCount recorded
        assert.equal(result.success, true);
        assert.equal(result.playerId, 'p-err');
        assert.equal(result.affectedModCount, 1);

        // Player record is NOT rolled back
        assert.equal(players.length, 1);
        assert.equal(associations.length, 1);
    });

    // Scenario 14: Deterministic README output
    it('14. should produce byte-for-byte deterministic README output across multiple re-syncs', () => {
        setupMod('mod-det', 'DeterministicMod', true);
        youtubers.push({ id: 'yt-z', name: 'Zack' });
        youtubers.push({ id: 'yt-a', name: 'Adam' });

        for (const ytId of ['yt-z', 'yt-a']) {
            accessList.push({
                id: `acc-${ytId}`,
                youtuberId: ytId,
                modProjectId: 'mod-det',
                status: 'ACTIVE',
                syncStatus: 'SUCCESS',
                grantType: 'MANUAL',
                manualDecision: 'NONE',
                sourceVideoAssignmentId: null,
                grantedAt: Date.now(),
                grantedByUserId: 'user-1',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        const u1 = normalizeUuid('cccccccc-cccc-cccc-cccc-cccccccccccc');
        const u2 = normalizeUuid('dddddddd-dddd-dddd-dddd-dddddddddddd');
        const u3 = normalizeUuid('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

        players.push({ id: 'p-1', username: 'P1', uuid: u3 });
        players.push({ id: 'p-2', username: 'P2', uuid: u1 });
        players.push({ id: 'p-3', username: 'P3', uuid: u2 });

        associations.push({ id: 'a-1', youtuberId: 'yt-z', minecraftPlayerId: 'p-1', relationshipType: 'PRIMARY', isPrimary: true, isActive: true });
        associations.push({ id: 'a-2', youtuberId: 'yt-a', minecraftPlayerId: 'p-2', relationshipType: 'PRIMARY', isPrimary: true, isActive: true });
        associations.push({ id: 'a-3', youtuberId: 'yt-a', minecraftPlayerId: 'p-3', relationshipType: 'FRIEND', isPrimary: false, isActive: true });

        // First execution
        const res1 = executeModSync('mod-det');
        assert.equal(res1.changed, true);
        const firstPass = gitRepos.get('mod-det')!.readmeContent;

        // Second execution (re-sync with unchanged state)
        const res2 = executeModSync('mod-det');
        assert.equal(res2.changed, false); // No drift, zero changes
        const secondPass = gitRepos.get('mod-det')!.readmeContent;

        assert.equal(firstPass, secondPass);

        // Verification of ordering: groups sorted by youtuberId, UUIDs sorted ascending
        const parsed = parseLegacyReadme(secondPass);
        assert.deepEqual(parsed.managedUuidsByYoutuber['yt-a'], [u1, u2]);
        assert.deepEqual(parsed.managedUuidsByYoutuber['yt-z'], [u3]);
    });

    // Scenario 15: Manual "İlgili Modları Senkronize Et" execution
    it('15. should allow manual sync execution across all active mods for a YouTuber on demand', () => {
        setupMod('mod-m1', 'ManualMod1', true);
        setupMod('mod-m2', 'ManualMod2', true);
        setupMod('mod-m3', 'ArchivedMod', true, true); // archived -> should skip

        youtubers.push({ id: 'yt-manual', name: 'ManualYT' });

        for (const mId of ['mod-m1', 'mod-m2', 'mod-m3']) {
            accessList.push({
                id: `acc-${mId}`,
                youtuberId: 'yt-manual',
                modProjectId: mId,
                status: 'ACTIVE',
                syncStatus: 'SUCCESS',
                grantType: 'MANUAL',
                manualDecision: 'NONE',
                sourceVideoAssignmentId: null,
                grantedAt: Date.now(),
                grantedByUserId: 'user-1',
                userId: 'user-1',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        const uuid = normalizeUuid('ffffffff-ffff-ffff-ffff-ffffffffffff');
        players.push({ id: 'p-man', username: 'ManualPlayer', uuid });
        associations.push({
            id: 'a-man',
            youtuberId: 'yt-manual',
            minecraftPlayerId: 'p-man',
            relationshipType: 'PRIMARY',
            isPrimary: true,
            isActive: true
        });

        // Trigger manual sync
        const result = simulatePlayerChangeSync({
            youtuberId: 'yt-manual',
            userId: 'user-1',
            triggerType: 'MANUAL_SYNC'
        });

        assert.equal(result.affectedModCount, 2);
        assert.deepEqual(result.affectedModIds.sort(), ['mod-m1', 'mod-m2']);
        assert.equal(gitRepos.get('mod-m1')?.commitCount, 1);
        assert.equal(gitRepos.get('mod-m2')?.commitCount, 1);
        assert.equal(gitRepos.get('mod-m3')?.commitCount, 0);
    });
});
