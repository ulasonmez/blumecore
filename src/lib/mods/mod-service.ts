import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    ModProject,
    VideoModProject,
    YoutuberModAccess,
    GitHubSyncJob,
    GitHubSyncRun,
    GitHubSyncTriggerType,
    DesiredModState,
    LegacyUuidInfo
} from './types';
import { getActiveMinecraftPlayersForYoutuber } from '../minecraft-players';
import {
    parseLegacyReadme,
    renderManagedReadme,
    RenderInputGroup
} from '../github/readme-parser';
import {
    getRepositoryFile,
    updateRepositoryFile,
    validateRepositoryParams,
    GitHubApiError
} from '../github/client';

/**
 * Validates ModProject parameters before creation or update.
 */
export function validateModProjectInput(data: {
    modKey: string;
    displayName: string;
    githubOwner: string;
    githubRepository: string;
    branch?: string;
    allowlistPath?: string;
}): void {
    if (!data.modKey || !data.modKey.trim()) {
        throw new Error('Mod ID (modKey) alanı zorunludur.');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(data.modKey.trim())) {
        throw new Error('Mod ID yalnızca harf, rakam, alt çizgi ve tire içerebilir.');
    }
    const effectiveDisplayName = (data.displayName && data.displayName.trim()) || data.modKey.trim();
    if (!effectiveDisplayName) {
        throw new Error('Mod ID veya Görünen Ad alanı zorunludur.');
    }

    validateRepositoryParams({
        githubOwner: data.githubOwner || 'blumeplugins',
        githubRepository: data.githubRepository || data.modKey.trim(),
        branch: data.branch || 'main',
        allowlistPath: data.allowlistPath || 'README.md'
    });
}

/**
 * Calculates the desired state of UUIDs for a given ModProject.
 */
export async function buildDesiredUuidState(
    modProjectId: string,
    userId: string
): Promise<DesiredModState> {
    // 1. Fetch active YouTuber access records for this mod
    const qAccess = query(
        collection(db, 'youtuber_mod_access'),
        where('modProjectId', '==', modProjectId),
        where('userId', '==', userId),
        where('status', '==', 'ACTIVE')
    );
    const accessSnap = await getDocs(qAccess);

    const youtuberGroups: DesiredModState['youtuberGroups'] = [];
    const allDesiredUuids: string[] = [];
    const seenUuids = new Set<string>();

    for (const aDoc of accessSnap.docs) {
        const accessData = aDoc.data() as YoutuberModAccess;

        // Fetch YouTuber details for display name
        const ySnap = await getDoc(doc(db, 'youtubers', accessData.youtuberId));
        const yName = ySnap.exists() ? ySnap.data()?.name || 'Bilinmeyen YouTuber' : 'Bilinmeyen YouTuber';

        // Fetch active Minecraft players
        const activePlayers = await getActiveMinecraftPlayersForYoutuber(accessData.youtuberId);

        const groupPlayers: { uuid: string; username: string }[] = [];
        for (const p of activePlayers) {
            if (!seenUuids.has(p.uuid)) {
                seenUuids.add(p.uuid);
                allDesiredUuids.push(p.uuid);
            }
            groupPlayers.push({
                uuid: p.uuid,
                username: p.username
            });
        }

        youtuberGroups.push({
            youtuberId: accessData.youtuberId,
            youtuberName: yName,
            players: groupPlayers
        });
    }

    return {
        modProjectId,
        youtuberGroups,
        allDesiredUuids,
        legacyConflicts: []
    };
}

/**
 * Creates or coalesces a sync job for a ModProject.
 * If there is already a PENDING job for this mod, returns that job instead of creating a duplicate.
 */
export async function createOrCoalesceSyncJob(
    modProjectId: string,
    userId: string,
    triggerType: GitHubSyncTriggerType
): Promise<GitHubSyncJob> {
    const qPending = query(
        collection(db, 'github_sync_jobs'),
        where('modProjectId', '==', modProjectId),
        where('userId', '==', userId),
        where('status', '==', 'PENDING')
    );
    const pendingSnap = await getDocs(qPending);

    const now = Date.now();

    if (!pendingSnap.empty) {
        const existingDoc = pendingSnap.docs[0];
        const existingJob = { id: existingDoc.id, ...existingDoc.data() } as GitHubSyncJob;
        return existingJob;
    }

    const newJobData: Omit<GitHubSyncJob, 'id'> = {
        modProjectId,
        status: 'PENDING',
        triggerType,
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

    const docRef = await addDoc(collection(db, 'github_sync_jobs'), newJobData);
    return { id: docRef.id, ...newJobData };
}

/**
 * Claims and executes a single sync job.
 */
export async function processSyncJob(
    jobId: string,
    workerId = 'interactive-worker'
): Promise<{ success: boolean; message: string; run?: GitHubSyncRun }> {
    const jobRef = doc(db, 'github_sync_jobs', jobId);
    const now = Date.now();

    // Atomic transaction claim to strictly prevent duplicate parallel execution
    let job: GitHubSyncJob;
    try {
        job = await runTransaction(db, async (tx) => {
            const jobDoc = await tx.get(jobRef);
            if (!jobDoc.exists()) {
                throw new Error('İş kaydı bulunamadı.');
            }
            const currentJob = { id: jobDoc.id, ...jobDoc.data() } as GitHubSyncJob;
            const isStale = currentJob.status === 'RUNNING' && currentJob.lockedAt && (now - currentJob.lockedAt > 5 * 60 * 1000);
            if (currentJob.status !== 'PENDING' && !isStale) {
                throw new Error(`İş şu anda ${currentJob.status} durumunda, çalıştırılamaz.`);
            }

            tx.update(jobRef, {
                status: 'RUNNING',
                lockedAt: now,
                lockedBy: workerId,
                startedAt: now,
                attemptCount: currentJob.attemptCount + 1,
                updatedAt: now
            });

            return {
                ...currentJob,
                status: 'RUNNING' as const,
                lockedAt: now,
                lockedBy: workerId,
                startedAt: now,
                attemptCount: currentJob.attemptCount + 1,
                updatedAt: now
            };
        });
    } catch (claimErr: unknown) {
        const msg = claimErr instanceof Error ? claimErr.message : 'İş atomik olarak kilitlenemedi.';
        return { success: false, message: msg };
    }

    const startTime = Date.now();

    try {
        // Fetch ModProject
        const modSnap = await getDoc(doc(db, 'mod_projects', job.modProjectId));
        if (!modSnap.exists()) {
            throw new Error('Mod projesi veritabanında bulunamadı.');
        }
        const modProject = { id: modSnap.id, ...modSnap.data() } as ModProject;

        if (!modProject.isActive) {
            // Mark job success as no-op because mod is deactivated
            await updateDoc(jobRef, {
                status: 'SUCCESS',
                completedAt: Date.now(),
                lockedAt: null,
                lockedBy: null,
                updatedAt: Date.now()
            });
            await updateDoc(doc(db, 'mod_projects', modProject.id), {
                syncStatus: 'SUCCESS',
                updatedAt: Date.now()
            });
            return { success: true, message: 'Mod pasif durumda olduğu için senkronizasyon atlandı.' };
        }

        // Build desired state
        const desiredState = await buildDesiredUuidState(job.modProjectId, job.userId);

        // Fetch current file from GitHub
        const gitFile = await getRepositoryFile(modProject);

        // Prepare render input
        const renderInput: RenderInputGroup[] = desiredState.youtuberGroups.map((g) => ({
            youtuberId: g.youtuberId,
            youtuberName: g.youtuberName,
            uuids: g.players.map((p) => p.uuid)
        }));

        const renderResult = renderManagedReadme(gitFile.content, renderInput);

        if (renderResult.isMalformed) {
            const errorMsg = renderResult.error || 'README marker yapısı bozuk.';
            await updateDoc(jobRef, {
                status: 'FAILED',
                lastErrorCode: 'FAILED_MALFORMED_MARKERS',
                lastErrorMessage: errorMsg,
                lockedAt: null,
                lockedBy: null,
                updatedAt: Date.now()
            });

            const failedRunData: Omit<GitHubSyncRun, 'id'> = {
                modProjectId: job.modProjectId,
                jobId: job.id,
                status: 'FAILED',
                desiredUuidCount: desiredState.allDesiredUuids.length,
                writtenUuidCount: 0,
                legacyUuidCount: 0,
                errorCode: 'FAILED_MALFORMED_MARKERS',
                safeErrorMessage: errorMsg,
                startedAt: startTime,
                completedAt: Date.now()
            };
            const rRef = await addDoc(collection(db, 'github_sync_runs'), failedRunData);

            return {
                success: false,
                message: errorMsg,
                run: { id: rRef.id, ...failedRunData }
            };
        }

        let commitSha: string | null = null;
        let runStatus: GitHubSyncRun['status'] = 'SUCCESS';

        if (renderResult.changed) {
            // Commit update to GitHub
            const updateRes = await updateRepositoryFile(
                modProject,
                renderResult.content,
                gitFile.sha
            );
            commitSha = updateRes.commitSha;
        } else {
            runStatus = desiredState.allDesiredUuids.length === 0 ? 'NO_ACTIVE_PLAYERS' : 'NO_OP';
        }

        // Update ModProject last sync info
        await updateDoc(doc(db, 'mod_projects', modProject.id), {
            lastSuccessfulSyncAt: Date.now(),
            lastSuccessfulCommitSha: commitSha || modProject.lastSuccessfulCommitSha || null,
            syncStatus: runStatus === 'NO_ACTIVE_PLAYERS' ? 'NO_ACTIVE_PLAYERS' : 'SUCCESS',
            updatedAt: Date.now()
        });

        // Complete job
        await updateDoc(jobRef, {
            status: 'SUCCESS',
            lastErrorCode: null,
            lastErrorMessage: null,
            completedAt: Date.now(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: Date.now()
        });

        const parsedLegacy = parseLegacyReadme(gitFile.content);

        const runRecord: Omit<GitHubSyncRun, 'id'> = {
            modProjectId: modProject.id,
            jobId: job.id,
            status: runStatus,
            desiredUuidCount: desiredState.allDesiredUuids.length,
            writtenUuidCount: renderResult.writtenUuidCount,
            legacyUuidCount: parsedLegacy.legacyUuids.length,
            commitSha,
            previousFileSha: gitFile.sha,
            startedAt: startTime,
            completedAt: Date.now()
        };
        const runDoc = await addDoc(collection(db, 'github_sync_runs'), runRecord);

        return {
            success: true,
            message: renderResult.changed
                ? 'GitHub README başarıyla güncellendi.'
                : 'README içeriği zaten güncel, değişiklik gerekmedi.',
            run: { id: runDoc.id, ...runRecord }
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Bilinmeyen senkronizasyon hatası.';
        const errorCode = err instanceof GitHubApiError ? err.errorCode : 'INTERNAL_ERROR';

        // Exponential backoff for next retry: 1m, 5m, 15m, 1h
        const backoffMinutes = [1, 5, 15, 60];
        const nextDelay = (backoffMinutes[Math.min(job.attemptCount, backoffMinutes.length - 1)] || 60) * 60 * 1000;

        await updateDoc(jobRef, {
            status: 'FAILED',
            lastErrorCode: errorCode,
            lastErrorMessage: errorMsg,
            nextAttemptAt: Date.now() + nextDelay,
            lockedAt: null,
            lockedBy: null,
            updatedAt: Date.now()
        });

        try {
            await updateDoc(doc(db, 'mod_projects', job.modProjectId), {
                syncStatus: 'FAILED',
                updatedAt: Date.now()
            });
        } catch {
            // ignore if mod not found
        }

        const failedRunData: Omit<GitHubSyncRun, 'id'> = {
            modProjectId: job.modProjectId,
            jobId: job.id,
            status: 'FAILED',
            desiredUuidCount: 0,
            writtenUuidCount: 0,
            legacyUuidCount: 0,
            errorCode,
            safeErrorMessage: errorMsg,
            startedAt: startTime,
            completedAt: Date.now()
        };
        const rRef = await addDoc(collection(db, 'github_sync_runs'), failedRunData);

        return {
            success: false,
            message: errorMsg,
            run: { id: rRef.id, ...failedRunData }
        };
    }
}

/**
 * Processes all pending and retriable failed jobs (called by cron or queue flush).
 */
export async function processPendingJobs(maxBatch = 10): Promise<{ processed: number; errors: number }> {
    const now = Date.now();
    const qJobs = query(
        collection(db, 'github_sync_jobs'),
        where('status', 'in', ['PENDING', 'FAILED', 'RUNNING'])
    );

    const snapshot = await getDocs(qJobs);
    let processed = 0;
    let errors = 0;

    for (const d of snapshot.docs) {
        if (processed >= maxBatch) break;

        const job = d.data() as GitHubSyncJob;
        const isStale = job.status === 'RUNNING' && job.lockedAt && now - job.lockedAt > 5 * 60 * 1000;
        const isRetriable = job.status === 'FAILED' && job.nextAttemptAt <= now && job.attemptCount < 5;
        const isPending = job.status === 'PENDING';

        if (isPending || isStale || isRetriable) {
            const res = await processSyncJob(d.id, 'cron-worker');
            processed++;
            if (!res.success) errors++;
        }
    }

    return { processed, errors };
}

/**
 * Handles video assignment in Calendar:
 * Finds all active ModProjects linked to videoId and grants access to the YouTuber.
 * Respects existing manual FORCE_DENY.
 */
export async function handleVideoAssignmentModAccess(
    videoId: string,
    youtuberId: string,
    userId: string,
    sourceVideoAssignmentId?: string
): Promise<{ affectedMods: string[]; syncResults: { modId: string; success: boolean; message: string }[] }> {
    // 1. Find all active video-mod links
    const qLinks = query(
        collection(db, 'video_mod_projects'),
        where('videoId', '==', videoId),
        where('userId', '==', userId)
    );
    const linkSnap = await getDocs(qLinks);
    if (linkSnap.empty) {
        return { affectedMods: [], syncResults: [] };
    }

    const modProjectIds = linkSnap.docs.map((d) => (d.data() as VideoModProject).modProjectId);
    const affectedMods: string[] = [];
    const syncResults: { modId: string; success: boolean; message: string }[] = [];

    const now = Date.now();

    for (const modId of modProjectIds) {
        // Verify mod is active
        const modSnap = await getDoc(doc(db, 'mod_projects', modId));
        if (!modSnap.exists() || !modSnap.data()?.isActive) {
            continue;
        }

        // Check existing access
        const qAccess = query(
            collection(db, 'youtuber_mod_access'),
            where('modProjectId', '==', modId),
            where('youtuberId', '==', youtuberId),
            where('userId', '==', userId)
        );
        const accessSnap = await getDocs(qAccess);

        let accessId: string;

        if (!accessSnap.empty) {
            const existing = accessSnap.docs[0];
            const data = existing.data() as YoutuberModAccess;
            accessId = existing.id;

            // RULE: If manually FORCE_DENY, DO NOT silently reactivate
            if (data.manualDecision === 'FORCE_DENY') {
                continue;
            }

            // Otherwise activate if revoked without force deny
            if (data.status !== 'ACTIVE') {
                await updateDoc(doc(db, 'youtuber_mod_access', accessId), {
                    status: 'ACTIVE',
                    syncStatus: 'PENDING',
                    sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                    updatedAt: now
                });
            }
        } else {
            // Create new automatic access
            const newAccessData: Omit<YoutuberModAccess, 'id'> = {
                youtuberId,
                modProjectId: modId,
                status: 'ACTIVE',
                syncStatus: 'PENDING',
                grantType: 'VIDEO_ASSIGNMENT',
                manualDecision: 'NONE',
                sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                grantedAt: now,
                grantedByUserId: userId,
                userId,
                createdAt: now,
                updatedAt: now
            };
            const aRef = await addDoc(collection(db, 'youtuber_mod_access'), newAccessData);
            accessId = aRef.id;

            // Log event
            await addDoc(collection(db, 'mod_access_events'), {
                youtuberModAccessId: accessId,
                modProjectId: modId,
                youtuberId,
                eventType: 'AUTO_GRANTED_FROM_VIDEO_ASSIGNMENT',
                sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                actorUserId: userId,
                createdAt: now
            });
        }

        affectedMods.push(modId);

        // Create job and execute immediately
        try {
            const job = await createOrCoalesceSyncJob(modId, userId, 'VIDEO_ASSIGNED');
            const res = await processSyncJob(job.id);
            syncResults.push({ modId, success: res.success, message: res.message });
        } catch (e: unknown) {
            syncResults.push({
                modId,
                success: false,
                message: e instanceof Error ? e.message : 'Senkronizasyon hatası.'
            });
        }
    }

    return { affectedMods, syncResults };
}

/**
 * Checks drift between GitHub live file and BlumeCore desired state.
 */
export async function checkModDrift(
    modProjectId: string,
    userId: string
): Promise<{
    isDrifted: boolean;
    isMalformed: boolean;
    liveSha?: string;
    error?: string;
    writtenUuidCount: number;
    skippedLegacyUuidCount: number;
    skippedLegacyUuids: string[];
    desiredContent: string;
    liveContent: string;
}> {
    const modSnap = await getDoc(doc(db, 'mod_projects', modProjectId));
    if (!modSnap.exists()) {
        throw new Error('Mod projesi bulunamadı.');
    }
    const mod = { id: modSnap.id, ...modSnap.data() } as ModProject;

    const gitFile = await getRepositoryFile(mod);
    const desired = await buildDesiredUuidState(modProjectId, userId);

    const renderInput: RenderInputGroup[] = desired.youtuberGroups.map((g) => ({
        youtuberId: g.youtuberId,
        youtuberName: g.youtuberName,
        uuids: g.players.map((p) => p.uuid)
    }));

    const result = renderManagedReadme(gitFile.content, renderInput);

    return {
        isDrifted: result.changed,
        isMalformed: result.isMalformed,
        liveSha: gitFile.sha,
        error: result.error,
        writtenUuidCount: result.writtenUuidCount,
        skippedLegacyUuidCount: result.skippedLegacyUuidCount,
        skippedLegacyUuids: result.skippedLegacyUuids,
        desiredContent: result.content,
        liveContent: gitFile.content
    };
}

/**
 * Fetches legacy unmanaged UUIDs for a mod project and enriches with known player names.
 */
export async function getLegacyUuidsForMod(
    modProjectId: string
): Promise<LegacyUuidInfo[]> {
    const modSnap = await getDoc(doc(db, 'mod_projects', modProjectId));
    if (!modSnap.exists()) {
        throw new Error('Mod projesi bulunamadı.');
    }
    const mod = { id: modSnap.id, ...modSnap.data() } as ModProject;

    const gitFile = await getRepositoryFile(mod);
    const parsed = parseLegacyReadme(gitFile.content);

    const counts: Record<string, number> = {};
    for (const u of parsed.legacyUuids) {
        counts[u] = (counts[u] || 0) + 1;
    }

    const uniqueLegacyUuids = Array.from(new Set(parsed.legacyUuids));
    const result: LegacyUuidInfo[] = [];

    for (const uuid of uniqueLegacyUuids) {
        // Lookup global player
        const qP = query(collection(db, 'minecraft_players'), where('uuid', '==', uuid));
        const pSnap = await getDocs(qP);

        let matchedPlayerUsername: string | null = null;
        let matchedYoutuberName: string | null = null;

        if (!pSnap.empty) {
            const pDoc = pSnap.docs[0];
            matchedPlayerUsername = pDoc.data().username || null;

            // Lookup YouTuber association
            const qA = query(
                collection(db, 'youtuber_minecraft_players'),
                where('minecraftPlayerId', '==', pDoc.id)
            );
            const aSnap = await getDocs(qA);
            if (!aSnap.empty) {
                const yId = aSnap.docs[0].data().youtuberId;
                const yDoc = await getDoc(doc(db, 'youtubers', yId));
                if (yDoc.exists()) {
                    matchedYoutuberName = yDoc.data()?.name || null;
                }
            }
        }

        result.push({
            uuid,
            matchedPlayerUsername,
            matchedYoutuberName,
            isDuplicateInLegacy: (counts[uuid] || 0) > 1
        });
    }

    return result;
}
