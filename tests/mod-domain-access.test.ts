import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    ModProject,
    VideoModProject,
    YoutuberModAccess,
    GitHubSyncJob
} from '../src/lib/mods/types';
import { normalizeUuid } from '../src/lib/minecraft-players';
import { validateRepositoryParams } from '../src/lib/github/client';

describe('Mod Domain & Access Control In-Memory Simulation Tests', () => {
    // In-memory simulation stores
    let modProjects: ModProject[] = [];
    let videoModLinks: VideoModProject[] = [];
    let modAccesses: YoutuberModAccess[] = [];
    let syncJobs: GitHubSyncJob[] = [];
    let players: { id: string; youtuberId: string; uuid: string; isActive: boolean }[] = [];

    beforeEach(() => {
        modProjects = [];
        videoModLinks = [];
        modAccesses = [];
        syncJobs = [];
        players = [];
    });

    // Helper: simulate creating a ModProject
    function createMod(data: {
        modKey: string;
        displayName: string;
        githubOwner?: string;
        githubRepository?: string;
        branch?: string;
        allowlistPath?: string;
        isActive?: boolean;
        userId: string;
    }): ModProject {
        const owner = data.githubOwner || 'blumeplugins';
        const repo = data.githubRepository || data.modKey;
        const branch = data.branch || 'main';
        const path = data.allowlistPath || 'README.md';

        validateRepositoryParams({
            githubOwner: owner,
            githubRepository: repo,
            branch,
            allowlistPath: path
        });

        if (modProjects.some((m) => m.userId === data.userId && m.modKey === data.modKey)) {
            throw new Error(`Mod ID ${data.modKey} zaten mevcut.`);
        }

        const newMod: ModProject = {
            id: `mod-${modProjects.length + 1}`,
            modKey: data.modKey,
            displayName: data.displayName,
            githubOwner: owner,
            githubRepository: repo,
            branch,
            allowlistPath: path,
            syncMode: 'LEGACY_README',
            isActive: data.isActive !== false,
            userId: data.userId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        modProjects.push(newMod);
        return newMod;
    }

    // Helper: simulate linking a video to a mod
    function linkVideoMod(videoId: string, modProjectId: string, userId: string): VideoModProject {
        const dup = videoModLinks.find(
            (l) => l.videoId === videoId && l.modProjectId === modProjectId && l.userId === userId
        );
        if (dup) {
            throw new Error('Bu mod zaten bu videoya bağlı.');
        }
        const link: VideoModProject = {
            id: `vml-${videoModLinks.length + 1}`,
            videoId,
            modProjectId,
            userId,
            createdAt: Date.now()
        };
        videoModLinks.push(link);
        return link;
    }

    // Helper: simulate video assignment hook (from Calendar)
    function handleVideoAssignment(
        videoId: string,
        youtuberId: string,
        userId: string,
        assignmentId: string
    ) {
        const links = videoModLinks.filter((l) => l.videoId === videoId && l.userId === userId);
        const affected: string[] = [];

        for (const l of links) {
            const mod = modProjects.find((m) => m.id === l.modProjectId && m.isActive);
            if (!mod) continue;

            let access = modAccesses.find(
                (a) => a.modProjectId === mod.id && a.youtuberId === youtuberId && a.userId === userId
            );

            if (access) {
                // Safety rule: FORCE_DENY cannot be silently reopened by video assignment
                if (access.manualDecision === 'FORCE_DENY') {
                    continue;
                }
                if (access.status !== 'ACTIVE') {
                    access.status = 'ACTIVE';
                    access.sourceVideoAssignmentId = assignmentId;
                    access.updatedAt = Date.now();
                }
            } else {
                access = {
                    id: `acc-${modAccesses.length + 1}`,
                    youtuberId,
                    modProjectId: mod.id,
                    status: 'ACTIVE',
                    grantType: 'VIDEO_ASSIGNMENT',
                    manualDecision: 'NONE',
                    sourceVideoAssignmentId: assignmentId,
                    grantedAt: Date.now(),
                    grantedByUserId: userId,
                    userId,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                modAccesses.push(access);
            }

            affected.push(mod.id);

            // Create or coalesce sync job
            let job = syncJobs.find((j) => j.modProjectId === mod.id && j.status === 'PENDING');
            if (!job) {
                job = {
                    id: `job-${syncJobs.length + 1}`,
                    modProjectId: mod.id,
                    status: 'PENDING',
                    triggerType: 'VIDEO_ASSIGNED',
                    attemptCount: 0,
                    nextAttemptAt: Date.now(),
                    userId,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                syncJobs.push(job);
            }
        }

        return affected;
    }

    // Helper: manual grant
    function grantManual(modProjectId: string, youtuberId: string, userId: string) {
        let access = modAccesses.find(
            (a) => a.modProjectId === modProjectId && a.youtuberId === youtuberId && a.userId === userId
        );
        if (access) {
            access.status = 'ACTIVE';
            access.manualDecision = 'FORCE_ALLOW';
            access.revokedAt = null;
            access.updatedAt = Date.now();
        } else {
            access = {
                id: `acc-${modAccesses.length + 1}`,
                youtuberId,
                modProjectId,
                status: 'ACTIVE',
                grantType: 'MANUAL',
                manualDecision: 'FORCE_ALLOW',
                grantedAt: Date.now(),
                grantedByUserId: userId,
                userId,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            modAccesses.push(access);
        }
    }

    // Helper: manual revoke
    function revokeManual(modProjectId: string, youtuberId: string, userId: string, reason = 'Manually revoked') {
        const access = modAccesses.find(
            (a) => a.modProjectId === modProjectId && a.youtuberId === youtuberId && a.userId === userId
        );
        if (!access) throw new Error('Erişim bulunamadı.');
        access.status = 'REVOKED';
        access.manualDecision = 'FORCE_DENY';
        access.revokedAt = Date.now();
        access.revokedByUserId = userId;
        access.revokeReason = reason;
        access.updatedAt = Date.now();
    }

    it('should create ModProject without requiring any video', () => {
        const mod = createMod({
            modKey: 'DyingIsOP',
            displayName: 'Dying Is OP',
            userId: 'user-1'
        });
        assert.equal(mod.modKey, 'DyingIsOP');
        assert.equal(mod.githubOwner, 'blumeplugins');
        assert.equal(mod.githubRepository, 'DyingIsOP');
        assert.equal(mod.branch, 'main');
        assert.equal(mod.allowlistPath, 'README.md');
        assert.equal(mod.isActive, true);
        assert.equal(videoModLinks.length, 0); // Completely videoless
    });

    it('should link multiple mods to a single video', () => {
        const mod1 = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        const mod2 = createMod({ modKey: 'ModB', displayName: 'Mod B', userId: 'u1' });

        linkVideoMod('video-1', mod1.id, 'u1');
        linkVideoMod('video-1', mod2.id, 'u1');

        const linked = videoModLinks.filter((l) => l.videoId === 'video-1');
        assert.equal(linked.length, 2);
    });

    it('should link a single mod to multiple videos', () => {
        const mod = createMod({ modKey: 'SharedMod', displayName: 'Shared Mod', userId: 'u1' });

        linkVideoMod('video-1', mod.id, 'u1');
        linkVideoMod('video-2', mod.id, 'u1');

        const links = videoModLinks.filter((l) => l.modProjectId === mod.id);
        assert.equal(links.length, 2);
    });

    it('should reject duplicate video-mod links for the same video and mod', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        linkVideoMod('video-1', mod.id, 'u1');

        assert.throws(() => {
            linkVideoMod('video-1', mod.id, 'u1');
        }, /zaten bu videoya bağlı/);
    });

    it('should automatically grant access when a video with connected mods is assigned in Calendar', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        linkVideoMod('vid-1', mod.id, 'u1');

        const affected = handleVideoAssignment('vid-1', 'yt-wollech', 'u1', 'assign-1');
        assert.deepEqual(affected, [mod.id]);

        const access = modAccesses.find((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-wollech');
        assert.ok(access);
        assert.equal(access.status, 'ACTIVE');
        assert.equal(access.grantType, 'VIDEO_ASSIGNMENT');
        assert.equal(access.manualDecision, 'NONE');
        assert.equal(access.sourceVideoAssignmentId, 'assign-1');

        // Verify sync job created
        assert.equal(syncJobs.length, 1);
        assert.equal(syncJobs[0].modProjectId, mod.id);
        assert.equal(syncJobs[0].status, 'PENDING');
    });

    it('should NOT create duplicate access when a second video with the same mod is assigned', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        linkVideoMod('vid-1', mod.id, 'u1');
        linkVideoMod('vid-2', mod.id, 'u1');

        handleVideoAssignment('vid-1', 'yt-wollech', 'u1', 'assign-1');
        handleVideoAssignment('vid-2', 'yt-wollech', 'u1', 'assign-2');

        const userAccesses = modAccesses.filter((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-wollech');
        assert.equal(userAccesses.length, 1); // Strictly single record
    });

    it('should allow manual access grant for a videoless mod', () => {
        const mod = createMod({ modKey: 'VideolessMod', displayName: 'Videoless Mod', userId: 'u1' });
        grantManual(mod.id, 'yt-1', 'u1');

        const access = modAccesses.find((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-1');
        assert.ok(access);
        assert.equal(access.status, 'ACTIVE');
        assert.equal(access.grantType, 'MANUAL');
        assert.equal(access.manualDecision, 'FORCE_ALLOW');
    });

    it('should allow manual revoke and set status to REVOKED with FORCE_DENY', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        grantManual(mod.id, 'yt-1', 'u1');

        revokeManual(mod.id, 'yt-1', 'u1', 'Test revoke');

        const access = modAccesses.find((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-1');
        assert.ok(access);
        assert.equal(access.status, 'REVOKED');
        assert.equal(access.manualDecision, 'FORCE_DENY');
    });

    it('should NOT silently reactivate a FORCE_DENY access when a new calendar video assignment occurs (critical rule)', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        linkVideoMod('vid-1', mod.id, 'u1');

        // 1. Initial grant
        handleVideoAssignment('vid-1', 'yt-wollech', 'u1', 'assign-1');

        // 2. Explicit manual revoke
        revokeManual(mod.id, 'yt-wollech', 'u1', 'Explicitly revoked by admin');

        // 3. New calendar video assignment arrives
        linkVideoMod('vid-2', mod.id, 'u1');
        const affected = handleVideoAssignment('vid-2', 'yt-wollech', 'u1', 'assign-2');

        // Should NOT affect this mod or reactivate
        assert.equal(affected.length, 0);
        const access = modAccesses.find((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-wollech');
        assert.equal(access?.status, 'REVOKED');
        assert.equal(access?.manualDecision, 'FORCE_DENY');
    });

    it('should allow manual regrant of a previously revoked FORCE_DENY access', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        grantManual(mod.id, 'yt-1', 'u1');
        revokeManual(mod.id, 'yt-1', 'u1');

        // Regrant
        grantManual(mod.id, 'yt-1', 'u1');

        const access = modAccesses.find((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-1');
        assert.equal(access?.status, 'ACTIVE');
        assert.equal(access?.manualDecision, 'FORCE_ALLOW');
    });

    it('should NOT automatically delete mod access when a video or calendar assignment is deleted', () => {
        const mod = createMod({ modKey: 'ModA', displayName: 'Mod A', userId: 'u1' });
        linkVideoMod('vid-1', mod.id, 'u1');
        handleVideoAssignment('vid-1', 'yt-1', 'u1', 'assign-1');

        // Simulate deleting video-mod link
        videoModLinks = videoModLinks.filter((l) => l.videoId !== 'vid-1');

        // Access remains ACTIVE
        const access = modAccesses.find((a) => a.modProjectId === mod.id && a.youtuberId === 'yt-1');
        assert.ok(access);
        assert.equal(access.status, 'ACTIVE');
    });

    it('should filter out passive players and deduplicate UUIDs for active YouTuber access', () => {
        // Player pool
        players = [
            { id: 'p1', youtuberId: 'yt-1', uuid: normalizeUuid('11111111111111111111111111111111'), isActive: true },
            { id: 'p2', youtuberId: 'yt-1', uuid: normalizeUuid('22222222222222222222222222222222'), isActive: false }, // Passive
            { id: 'p3', youtuberId: 'yt-1', uuid: normalizeUuid('11111111111111111111111111111111'), isActive: true }  // Duplicate
        ];

        const activePlayerUuids = Array.from(
            new Set(players.filter((p) => p.youtuberId === 'yt-1' && p.isActive).map((p) => p.uuid))
        );

        assert.equal(activePlayerUuids.length, 1);
        assert.equal(activePlayerUuids[0], '11111111-1111-1111-1111-111111111111');
    });
});
