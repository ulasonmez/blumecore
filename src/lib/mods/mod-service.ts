import { adminDb } from '../firebase-admin';
import {
    ModProject,
    VideoModProject,
    YoutuberModAccess,
    GitHubSyncJob,
    GitHubSyncRun,
    GitHubSyncTriggerType,
    DesiredModState,
    LegacyUuidInfo,
    ModArchiveStatus,
    ModLifecycleStatus,
    resolveModLifecycleStatus,
    ModAccessSource
} from './types';
import { normalizeUuid } from '../minecraft-players';
import { getGlobalMinecraftPlayersAdmin, BLUME_GLOBAL_UUID } from '../global-players';
import {
    parseLegacyReadme,
    renderManagedReadme,
    RenderInputGroup
} from '../github/readme-parser';
import {
    getRepositoryFile,
    updateRepositoryFile,
    validateRepositoryParams,
    GitHubApiError,
    GitHubFileResponse
} from '../github/client';
import { logAudit } from '../audit-log';

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
 * Helper to fetch active Minecraft players for a YouTuber on server side using Firebase Admin SDK.
 */
export async function getActiveMinecraftPlayersForYoutuberAdmin(youtuberId: string) {
    const assocSnap = await adminDb
        .collection('youtuber_minecraft_players')
        .where('youtuberId', '==', youtuberId)
        .where('isActive', '==', true)
        .get();

    if (assocSnap.empty) return [];

    const results: { uuid: string; username: string; relationshipType: string; isPrimary: boolean }[] = [];
    const seenUuids = new Set<string>();

    for (const d of assocSnap.docs) {
        const data = d.data();
        const pSnap = await adminDb.collection('minecraft_players').doc(data.minecraftPlayerId).get();
        if (pSnap.exists) {
            const pData = pSnap.data();
            const canonical = normalizeUuid(pData?.uuid || '');
            if (canonical && !seenUuids.has(canonical)) {
                seenUuids.add(canonical);
                results.push({
                    uuid: canonical,
                    username: pData?.username || 'Bilinmeyen',
                    relationshipType: data.relationshipType || 'other',
                    isPrimary: !!data.isPrimary
                });
            }
        }
    }

    return results;
}

/**
 * Calculates the desired state of UUIDs for a given ModProject.
 */
export async function buildDesiredUuidState(
    modProjectId: string,
    userId: string
): Promise<DesiredModState> {
    // 1. Fetch active YouTuber access records for this mod
    const accessSnap = await adminDb
        .collection('youtuber_mod_access')
        .where('modProjectId', '==', modProjectId)
        .where('userId', '==', userId)
        .where('status', '==', 'ACTIVE')
        .get();

    const youtuberGroups: DesiredModState['youtuberGroups'] = [];
    const allDesiredUuids: string[] = [];
    const seenUuids = new Set<string>();

    // 0. Include dedicated Global Blume players (independent from YouTuber accesses)
    try {
        const globalPlayers = await getGlobalMinecraftPlayersAdmin();
        if (globalPlayers.length > 0) {
            const globalPlayerList: { uuid: string; username: string }[] = [];
            for (const gp of globalPlayers) {
                if (!seenUuids.has(gp.uuid)) {
                    seenUuids.add(gp.uuid);
                    allDesiredUuids.push(gp.uuid);
                }
                globalPlayerList.push({
                    uuid: gp.uuid,
                    username: gp.username
                });
            }

            youtuberGroups.push({
                youtuberId: '__global_blume__',
                youtuberName: 'Global Blume',
                players: globalPlayerList
            });
        }
    } catch (gErr) {
        console.warn('[buildDesiredUuidState] Warning loading global players:', gErr);
    }

    // 0.1 Include manually protected managed entries for this mod
    try {
        const modDoc = await adminDb.collection('mod_projects').doc(modProjectId).get();
        if (modDoc.exists) {
            const modData = modDoc.data();
            const manualUuids = (modData?.manualProtectedUuids as string[]) || [];
            if (Array.isArray(manualUuids) && manualUuids.length > 0) {
                const manualList: { uuid: string; username: string }[] = [];
                for (const rawUuid of manualUuids) {
                    const u = typeof rawUuid === 'string' ? rawUuid.toLowerCase().trim() : '';
                    if (u && !seenUuids.has(u)) {
                        seenUuids.add(u);
                        allDesiredUuids.push(u);
                        manualList.push({ uuid: u, username: 'Manuel Korunan' });
                    }
                }
                if (manualList.length > 0) {
                    youtuberGroups.push({
                        youtuberId: '__manual_protected__',
                        youtuberName: 'Manuel Korunan Oyuncular',
                        players: manualList
                    });
                }
            }
        }
    } catch (mErr) {
        console.warn('[buildDesiredUuidState] Warning loading manual protected UUIDs:', mErr);
    }

    for (const aDoc of accessSnap.docs) {
        const accessData = aDoc.data() as YoutuberModAccess;

        // Fetch YouTuber details for display name
        const ySnap = await adminDb.collection('youtubers').doc(accessData.youtuberId).get();
        const yName = ySnap.exists ? ySnap.data()?.name || 'Bilinmeyen YouTuber' : 'Bilinmeyen YouTuber';

        // Fetch active Minecraft players using admin SDK
        const activePlayers = await getActiveMinecraftPlayersForYoutuberAdmin(accessData.youtuberId);

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

export interface PreparedSyncJob {
    coalescedJob?: GitHubSyncJob;
    newJobRef: FirebaseFirestore.DocumentReference;
    newJobData: Omit<GitHubSyncJob, 'id'>;
}

/**
 * PHASE 1 (READ): Prepares a sync job inside a transaction BEFORE any write operations occur.
 * Reads existing PENDING/RUNNING jobs for coalescing.
 */
export async function prepareSyncJobInTx(
    tx: FirebaseFirestore.Transaction,
    modProjectId: string,
    userId: string,
    triggerType: GitHubSyncTriggerType
): Promise<PreparedSyncJob> {
    const query = adminDb
        .collection('github_sync_jobs')
        .where('modProjectId', '==', modProjectId)
        .where('userId', '==', userId)
        .where('status', 'in', ['PENDING', 'RUNNING']);

    const activeSnap = await tx.get(query);
    const now = Date.now();

    if (!activeSnap.empty) {
        for (const doc of activeSnap.docs) {
            const data = doc.data() as Omit<GitHubSyncJob, 'id'>;
            const isStaleRunning = data.status === 'RUNNING' && data.lockedAt && (now - data.lockedAt > 5 * 60 * 1000);
            if (!isStaleRunning) {
                return {
                    coalescedJob: { id: doc.id, ...data },
                    newJobRef: adminDb.collection('github_sync_jobs').doc(),
                    newJobData: {
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
                    }
                };
            }
        }
    }

    const docRef = adminDb.collection('github_sync_jobs').doc();
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

    return {
        newJobRef: docRef,
        newJobData
    };
}

/**
 * PHASE 2 (WRITE): Applies a prepared sync job inside a transaction AFTER all reads are done.
 */
export function applySyncJobInTx(
    tx: FirebaseFirestore.Transaction,
    prepared: PreparedSyncJob
): GitHubSyncJob {
    if (prepared.coalescedJob) {
        return prepared.coalescedJob;
    }
    tx.set(prepared.newJobRef, prepared.newJobData);
    return { id: prepared.newJobRef.id, ...prepared.newJobData };
}

/**
 * Creates or coalesces a sync job for a ModProject.
 * If there is already a PENDING job for this mod, returns that job instead of creating a duplicate.
 * Uses atomic Firestore transaction to prevent duplicate parallel job creation.
 */
export async function createOrCoalesceSyncJob(
    modProjectId: string,
    userId: string,
    triggerType: GitHubSyncTriggerType,
    existingTx?: FirebaseFirestore.Transaction
): Promise<GitHubSyncJob> {
    const runInTx = async (tx: FirebaseFirestore.Transaction): Promise<GitHubSyncJob> => {
        const prepared = await prepareSyncJobInTx(tx, modProjectId, userId, triggerType);
        return applySyncJobInTx(tx, prepared);
    };

    if (existingTx) {
        return await runInTx(existingTx);
    }
    return await adminDb.runTransaction(runInTx);
}

/**
 * Claims and executes a single sync job.
 */
export async function processSyncJob(
    jobId: string,
    workerId = 'interactive-worker'
): Promise<{ success: boolean; message: string; run?: GitHubSyncRun }> {
    const jobRef = adminDb.collection('github_sync_jobs').doc(jobId);
    const now = Date.now();

    // Atomic transaction claim to strictly prevent duplicate parallel execution
    let job: GitHubSyncJob;
    try {
        job = await adminDb.runTransaction(async (tx) => {
            const jobDoc = await tx.get(jobRef);
            if (!jobDoc.exists) {
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
        const modSnap = await adminDb.collection('mod_projects').doc(job.modProjectId).get();
        if (!modSnap.exists) {
            await jobRef.update({
                status: 'CANCELLED',
                completedAt: Date.now(),
                lockedAt: null,
                lockedBy: null,
                updatedAt: Date.now()
            });
            return { success: true, message: 'Mod projesi silindiği için senkronizasyon iptal edildi.' };
        }
        const modProject = { id: modSnap.id, ...modSnap.data() } as ModProject;

        if (!modProject.isActive) {
            // Mark job success as no-op because mod is deactivated
            await jobRef.update({
                status: 'SUCCESS',
                completedAt: Date.now(),
                lockedAt: null,
                lockedBy: null,
                updatedAt: Date.now()
            });
            await adminDb.collection('mod_projects').doc(modProject.id).update({
                syncStatus: 'SUCCESS',
                updatedAt: Date.now()
            });
            return { success: true, message: 'Mod pasif durumda olduğu için senkronizasyon atlandı.' };
        }

        // Build desired state
        const desiredState = await buildDesiredUuidState(job.modProjectId, job.userId);

        // Fetch current file from GitHub (if not found, start with empty content so README can be created)
        let gitFile: GitHubFileResponse;
        try {
            gitFile = await getRepositoryFile(modProject);
        } catch (fErr) {
            if (fErr instanceof GitHubApiError && fErr.errorCode === 'NOT_FOUND') {
                gitFile = {
                    content: '',
                    sha: '',
                    path: modProject.allowlistPath,
                    size: 0
                };
            } else {
                throw fErr;
            }
        }

        // Prepare render input
        const renderInput: RenderInputGroup[] = desiredState.youtuberGroups.map((g) => ({
            youtuberId: g.youtuberId,
            youtuberName: g.youtuberName,
            uuids: g.players.map((p) => p.uuid)
        }));

        const renderResult = renderManagedReadme(gitFile.content, renderInput);

        if (renderResult.isMalformed) {
            const errorMsg = renderResult.error || 'README marker yapısı bozuk.';
            await jobRef.update({
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
            const rRef = await adminDb.collection('github_sync_runs').add(failedRunData);

            return {
                success: false,
                message: errorMsg,
                run: { id: rRef.id, ...failedRunData }
            };
        }

        let commitSha: string | null = null;
        let runStatus: GitHubSyncRun['status'] = 'SUCCESS';

        if (renderResult.changed) {
            // Commit update to GitHub (if sha is empty, client creates the file)
            const updateRes = await updateRepositoryFile(
                modProject,
                renderResult.content,
                gitFile.sha || undefined
            );
            commitSha = updateRes.commitSha;
        } else {
            runStatus = desiredState.allDesiredUuids.length === 0 ? 'NO_ACTIVE_PLAYERS' : 'NO_OP';
        }

        // Update ModProject last sync info
        await adminDb.collection('mod_projects').doc(modProject.id).update({
            lastSuccessfulSyncAt: Date.now(),
            lastSuccessfulCommitSha: commitSha || modProject.lastSuccessfulCommitSha || null,
            syncStatus: runStatus === 'NO_ACTIVE_PLAYERS' ? 'NO_ACTIVE_PLAYERS' : 'SUCCESS',
            updatedAt: Date.now()
        });

        // Complete job
        await jobRef.update({
            status: 'SUCCESS',
            lastErrorCode: null,
            lastErrorMessage: null,
            completedAt: Date.now(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: Date.now()
        });

        const parsedLegacy = parseLegacyReadme(gitFile.content);
        const satisfiedByLegacy = renderResult.skippedLegacyUuids.includes(BLUME_GLOBAL_UUID);

        const runRecord: Omit<GitHubSyncRun, 'id'> = {
            modProjectId: modProject.id,
            jobId: job.id,
            status: runStatus,
            desiredUuidCount: desiredState.allDesiredUuids.length,
            writtenUuidCount: renderResult.writtenUuidCount,
            legacyUuidCount: parsedLegacy.legacyUuids.length,
            commitSha,
            previousFileSha: gitFile.sha || null,
            satisfiedByLegacy,
            startedAt: startTime,
            completedAt: Date.now()
        };
        const runDoc = await adminDb.collection('github_sync_runs').add(runRecord);

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

        await jobRef.update({
            status: 'FAILED',
            lastErrorCode: errorCode,
            lastErrorMessage: errorMsg,
            nextAttemptAt: Date.now() + nextDelay,
            lockedAt: null,
            lockedBy: null,
            updatedAt: Date.now()
        });

        try {
            await adminDb.collection('mod_projects').doc(job.modProjectId).update({
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
        const rRef = await adminDb.collection('github_sync_runs').add(failedRunData);

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
export async function processPendingJobs(maxBatch = 20): Promise<{ processed: number; errors: number }> {
    const now = Date.now();
    // Auto-recover any stale ARCHIVING mods
    try {
        await recoverStaleArchivingMods();
    } catch (e) {
        console.warn('[processPendingJobs] Stale archiving recovery warning:', e);
    }

    const snapshot = await adminDb
        .collection('github_sync_jobs')
        .where('status', 'in', ['PENDING', 'FAILED', 'RUNNING'])
        .get();

    let processed = 0;
    let errors = 0;

    for (const d of snapshot.docs) {
        if (processed >= maxBatch) break;

        const job = d.data() as GitHubSyncJob;
        const isStale = job.status === 'RUNNING' && job.lockedAt && now - job.lockedAt > 5 * 60 * 1000;
        const isRetriable = job.status === 'FAILED' && job.nextAttemptAt <= now && job.attemptCount < 5;
        const isPending = job.status === 'PENDING' && (!job.nextAttemptAt || job.nextAttemptAt <= now);

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
    const linkSnap = await adminDb
        .collection('video_mod_projects')
        .where('videoId', '==', videoId)
        .where('userId', '==', userId)
        .get();

    if (linkSnap.empty) {
        return { affectedMods: [], syncResults: [] };
    }

    const modProjectIds = linkSnap.docs.map((d) => (d.data() as VideoModProject).modProjectId);
    const affectedMods: string[] = [];
    const syncResults: { modId: string; success: boolean; message: string }[] = [];

    const now = Date.now();

    for (const modId of modProjectIds) {
        // Verify mod is active
        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists || !modSnap.data()?.isActive) {
            continue;
        }

        // Check existing access
        const accessSnap = await adminDb
            .collection('youtuber_mod_access')
            .where('modProjectId', '==', modId)
            .where('youtuberId', '==', youtuberId)
            .where('userId', '==', userId)
            .get();

        let accessId: string;

        if (!accessSnap.empty) {
            const existing = accessSnap.docs[0];
            const data = existing.data() as YoutuberModAccess;
            accessId = existing.id;

            // RULE: If manually FORCE_DENY, DO NOT silently reactivate
            if (data.manualDecision === 'FORCE_DENY') {
                continue;
            }

            const existingSources: ModAccessSource[] = data.grantSources || [];
            const newSource: ModAccessSource = {
                type: 'VIDEO_ASSIGNMENT',
                sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                videoId,
                addedAt: now
            };
            const filteredSources = existingSources.filter(
                (s) => !(s.type === 'VIDEO_ASSIGNMENT' && s.sourceVideoAssignmentId === (sourceVideoAssignmentId || null) && s.videoId === videoId)
            );
            filteredSources.push(newSource);

            const updates: Record<string, unknown> = {
                grantSources: filteredSources,
                sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                updatedAt: now
            };
            if (data.status !== 'ACTIVE') {
                updates.status = 'ACTIVE';
                updates.syncStatus = 'PENDING';
            }
            await adminDb.collection('youtuber_mod_access').doc(accessId).update(updates);
        } else {
            // Create new automatic access
            const newSource: ModAccessSource = {
                type: 'VIDEO_ASSIGNMENT',
                sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                videoId,
                addedAt: now
            };
            const newAccessData: Omit<YoutuberModAccess, 'id'> = {
                youtuberId,
                modProjectId: modId,
                status: 'ACTIVE',
                syncStatus: 'PENDING',
                grantType: 'VIDEO_ASSIGNMENT',
                grantSources: [newSource],
                manualDecision: 'NONE',
                sourceVideoAssignmentId: sourceVideoAssignmentId || null,
                grantedAt: now,
                grantedByUserId: userId,
                userId,
                createdAt: now,
                updatedAt: now
            };
            const aRef = await adminDb.collection('youtuber_mod_access').add(newAccessData);
            accessId = aRef.id;

            // Log event
            await adminDb.collection('mod_access_events').add({
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
    const modSnap = await adminDb.collection('mod_projects').doc(modProjectId).get();
    if (!modSnap.exists) {
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
    const modSnap = await adminDb.collection('mod_projects').doc(modProjectId).get();
    if (!modSnap.exists) {
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
        const pSnap = await adminDb.collection('minecraft_players').where('uuid', '==', uuid).get();

        let matchedPlayerUsername: string | null = null;
        let matchedYoutuberName: string | null = null;

        if (!pSnap.empty) {
            const pDoc = pSnap.docs[0];
            matchedPlayerUsername = pDoc.data().username || null;

            // Lookup YouTuber association
            const aSnap = await adminDb
                .collection('youtuber_minecraft_players')
                .where('minecraftPlayerId', '==', pDoc.id)
                .get();

            if (!aSnap.empty) {
                const yId = aSnap.docs[0].data().youtuberId;
                const yDoc = await adminDb.collection('youtubers').doc(yId).get();
                if (yDoc.exists) {
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

export interface PlayerSyncSummary {
    success: boolean;
    playerId?: string;
    affectedModCount: number;
    queuedJobCount: number;
    coalescedJobCount: number;
    legacyConflicts: { modId: string; reason: string }[];
    affectedModIds: string[];
    queuedJobIds: string[];
}

/**
 * Automatically calculates affected active mods for a YouTuber,
 * inspects legacy conflicts, queues/coalesces sync jobs with outbox pattern,
 * and processes sync jobs without failing the player operation.
 */
export async function syncActiveModsForYoutuberChange(params: {
    youtuberId: string;
    userId: string;
    triggerType: GitHubSyncTriggerType;
    playerId?: string;
    changedUuid?: string;
    oldUuid?: string;
    processImmediately?: boolean;
    tx?: FirebaseFirestore.Transaction;
}): Promise<PlayerSyncSummary> {
    const { youtuberId, userId, triggerType, playerId, changedUuid, oldUuid, tx } = params;

    const accessSnap = await adminDb
        .collection('youtuber_mod_access')
        .where('youtuberId', '==', youtuberId)
        .where('userId', '==', userId)
        .where('status', '==', 'ACTIVE')
        .get();

    if (accessSnap.empty) {
        return {
            success: true,
            playerId,
            affectedModCount: 0,
            queuedJobCount: 0,
            coalescedJobCount: 0,
            legacyConflicts: [],
            affectedModIds: [],
            queuedJobIds: []
        };
    }

    const affectedModIds: string[] = [];
    const legacyConflicts: { modId: string; reason: string }[] = [];
    const queuedJobIds: string[] = [];
    let queuedJobCount = 0;
    let coalescedJobCount = 0;

    const candidateUuids = [changedUuid, oldUuid]
        .filter(Boolean)
        .map((u) => normalizeUuid(u as string));

    for (const aDoc of accessSnap.docs) {
        const accessData = aDoc.data() as YoutuberModAccess;
        if (accessData.manualDecision === 'FORCE_DENY') {
            continue; // Skip FORCE_DENY
        }

        const modId = accessData.modProjectId;
        if (!modId || affectedModIds.includes(modId)) {
            continue;
        }

        // Verify mod exists, is active, and is not archived
        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists) continue;
        const modData = modSnap.data() as ModProject;
        if (!modData.isActive || modData.isArchived) continue;

        affectedModIds.push(modId);

        // Check for legacy UUID conflicts in README if candidate UUIDs exist
        if (candidateUuids.length > 0) {
            try {
                const gitFile = await getRepositoryFile(modData);
                const parsed = parseLegacyReadme(gitFile.content);
                for (const u of candidateUuids) {
                    if (parsed.legacyUuids.includes(u)) {
                        if (!legacyConflicts.some((c) => c.modId === modData.modKey)) {
                            legacyConflicts.push({
                                modId: modData.modKey,
                                reason: 'UUID_EXISTS_IN_LEGACY_SECTION'
                            });
                        }
                    }
                }
            } catch {
                // Non-fatal advisory check
            }
        }

        // Queue or coalesce sync job
        const now = Date.now();
        let jobId: string;

        if (tx) {
            // Atomic transaction write
            queuedJobCount++;
            const newJobRef = adminDb.collection('github_sync_jobs').doc();
            tx.set(newJobRef, {
                modProjectId: modId,
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
            });
            jobId = newJobRef.id;
        } else {
            const pendingSnap = await adminDb
                .collection('github_sync_jobs')
                .where('modProjectId', '==', modId)
                .where('userId', '==', userId)
                .where('status', '==', 'PENDING')
                .get();

            if (!pendingSnap.empty) {
                coalescedJobCount++;
                jobId = pendingSnap.docs[0].id;
            } else {
                queuedJobCount++;
                const newJob = await adminDb.collection('github_sync_jobs').add({
                    modProjectId: modId,
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
                });
                jobId = newJob.id;
            }
        }

        queuedJobIds.push(jobId);
    }

    // Process queued jobs immediately if not running within an active transaction
    if (!tx && params.processImmediately !== false && queuedJobIds.length > 0) {
        for (const jId of queuedJobIds) {
            try {
                await processSyncJob(jId, 'player-sync-worker');
            } catch (jobErr) {
                console.warn(`[sync-mods] Job ${jId} failed:`, jobErr);
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

/**
 * Two-phase Mod Archiving (ACTIVE -> ARCHIVING -> ARCHIVED / ARCHIVE_FAILED).
 * Clears all YouTuber UUIDs from the managed section of README.md while
 * strictly preserving the Global Blume UUID and unmanaged legacy lines.
 * Only marks the mod ARCHIVED if the GitHub sync succeeds.
 */
export async function archiveModProject(
    modProjectId: string,
    userId: string
): Promise<{ success: boolean; archiveStatus: ModArchiveStatus; error?: string }> {
    const modRef = adminDb.collection('mod_projects').doc(modProjectId);
    const modSnap = await modRef.get();
    if (!modSnap.exists) {
        throw new Error('Mod projesi bulunamadı.');
    }
    const mod = { id: modSnap.id, ...modSnap.data() } as ModProject;

    // 1. Move to ARCHIVING state
    await modRef.update({
        lifecycleStatus: 'ARCHIVING',
        archiveStatus: 'ARCHIVING',
        updatedAt: Date.now()
    });

    try {
        // Fetch current README from GitHub
        const gitFile = await getRepositoryFile(mod);

        // Desired groups for archiving: EMPTY (remove all YouTuber blocks)
        // renderManagedReadme preserves unmanaged legacy content (Global Blume UUIDs)
        const renderResult = renderManagedReadme(gitFile.content, []);

        if (renderResult.isMalformed) {
            throw new Error(renderResult.error || 'README dosyasında bozuk marker tespit edildi.');
        }

        let commitSha = gitFile.sha;
        if (renderResult.changed) {
            const commitMessage = `BlumeCore: archive mod ${mod.modKey} (clearing YouTuber allowlists)`;
            const updateRes = await updateRepositoryFile(
                mod,
                renderResult.content,
                gitFile.sha,
                0,
                commitMessage
            );
            commitSha = updateRes.commitSha;
        }

        // 2. Success: ACTIVE -> ARCHIVING -> ARCHIVED
        const now = Date.now();
        await modRef.update({
            lifecycleStatus: 'ARCHIVED',
            archiveStatus: 'ARCHIVED',
            isArchived: true,
            isActive: false,
            archiveError: null,
            lastSuccessfulSyncAt: now,
            lastSuccessfulCommitSha: commitSha,
            syncStatus: 'SUCCESS',
            updatedAt: now
        });

        // Record audit log
        await logAudit({
            eventType: 'MOD_ARCHIVED',
            actorUserId: userId,
            timestamp: now,
            modId: mod.modKey,
            owner: mod.githubOwner
        });

        return { success: true, archiveStatus: 'ARCHIVED' };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Arşivleme sırasında GitHub senkronizasyon hatası oluştu.';
        const now = Date.now();
        await modRef.update({
            lifecycleStatus: 'ARCHIVE_FAILED',
            archiveStatus: 'ARCHIVE_FAILED',
            isArchived: false,
            archiveError: errorMsg,
            updatedAt: now
        });

        return { success: false, archiveStatus: 'ARCHIVE_FAILED', error: errorMsg };
    }
}

/**
 * Restores an archived mod back to ACTIVE state and re-syncs current desired state.
 */
export async function restoreModProject(
    modProjectId: string,
    userId: string
): Promise<{ success: boolean; archiveStatus: ModArchiveStatus; error?: string }> {
    const modRef = adminDb.collection('mod_projects').doc(modProjectId);
    const modSnap = await modRef.get();
    if (!modSnap.exists) {
        throw new Error('Mod projesi bulunamadı.');
    }
    const mod = { id: modSnap.id, ...modSnap.data() } as ModProject;

    const now = Date.now();
    await modRef.update({
        lifecycleStatus: 'ACTIVE',
        archiveStatus: 'ACTIVE',
        isArchived: false,
        isActive: true,
        archiveError: null,
        syncStatus: 'PENDING',
        updatedAt: now
    });

    // Queue and immediately process sync job with current desired state
    try {
        const job = await createOrCoalesceSyncJob(modProjectId, userId, 'MOD_RESTORED');
        const runRes = await processSyncJob(job.id, 'restore-worker');
        if (!runRes.success) {
            console.warn(`[restoreMod] Immediate sync warning: ${runRes.message}`);
        }
    } catch (jobErr) {
        console.warn('[restoreMod] Sync job execution error:', jobErr);
    }

    await logAudit({
        eventType: 'MOD_RESTORED',
        actorUserId: userId,
        timestamp: now,
        modId: mod.modKey,
        owner: mod.githubOwner
    });

    return { success: true, archiveStatus: 'ACTIVE' };
}

/**
 * Recovers mod projects that have been stuck in ARCHIVING for longer than timeoutMs (default: 5 minutes).
 * Moves them to ARCHIVE_FAILED with an informative error message.
 */
export async function recoverStaleArchivingMods(timeoutMs = 5 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const snap = await adminDb
        .collection('mod_projects')
        .where('lifecycleStatus', '==', 'ARCHIVING')
        .get();

    let recovered = 0;
    for (const doc of snap.docs) {
        const data = doc.data() as ModProject;
        if (data.updatedAt && now - data.updatedAt > timeoutMs) {
            await doc.ref.update({
                lifecycleStatus: 'ARCHIVE_FAILED',
                archiveStatus: 'ARCHIVE_FAILED',
                archiveError: 'Arşivleme işlemi zaman aşımına uğradı (stale ARCHIVING). Yeniden deneyebilirsiniz.',
                updatedAt: now
            });
            recovered++;
        }
    }
    return recovered;
}

/**
 * Cascade recalculation across YouTubers, Videos, Assignments, and Mod links.
 * Preserves multi-source access (VIDEO_ASSIGNMENT, MANUAL, GLOBAL).
 * A YouTuber keeps mod access if at least one active source remains.
 */
export async function recalculateCascadeAccess(params: {
    userId: string;
    action: 'VIDEO_DELETED' | 'VIDEO_MOD_UNLINKED' | 'ASSIGNMENT_DELETED' | 'YOUTUBER_DELETED' | 'YOUTUBER_DEACTIVATED';
    videoId?: string;
    modProjectId?: string;
    assignmentId?: string;
    youtuberId?: string;
}): Promise<{ affectedModIds: string[]; queuedJobIds: string[] }> {
    const { userId, action, videoId, modProjectId, assignmentId, youtuberId } = params;
    const affectedModIds = new Set<string>();
    const now = Date.now();

    if (action === 'VIDEO_DELETED' && videoId) {
        // 1. Find all mod links for this video
        const linkSnap = await adminDb.collection('video_mod_projects').where('videoId', '==', videoId).get();
        for (const lDoc of linkSnap.docs) {
            affectedModIds.add(lDoc.data().modProjectId);
            await lDoc.ref.delete();
        }

        // 2. Find accesses with this video in grantSources
        const accessSnap = await adminDb.collection('youtuber_mod_access').where('userId', '==', userId).get();
        for (const aDoc of accessSnap.docs) {
            const data = aDoc.data() as YoutuberModAccess;
            if (!data.grantSources || data.grantSources.length === 0) {
                // Legacy record fallback
                if (data.sourceVideoAssignmentId === videoId || affectedModIds.has(data.modProjectId)) {
                    if (data.grantType !== 'MANUAL' && data.manualDecision !== 'FORCE_ALLOW') {
                        await aDoc.ref.update({ status: 'REVOKED', syncStatus: 'PENDING', updatedAt: now });
                        affectedModIds.add(data.modProjectId);
                    }
                }
                continue;
            }

            const remainingSources = data.grantSources.filter((s) => s.videoId !== videoId);
            if (remainingSources.length !== data.grantSources.length) {
                const newStatus = (remainingSources.length > 0 || data.manualDecision === 'FORCE_ALLOW') && data.manualDecision !== 'FORCE_DENY'
                    ? 'ACTIVE'
                    : 'REVOKED';
                await aDoc.ref.update({
                    grantSources: remainingSources,
                    status: newStatus,
                    syncStatus: 'PENDING',
                    updatedAt: now
                });
                affectedModIds.add(data.modProjectId);
            }
        }
    } else if (action === 'VIDEO_MOD_UNLINKED' && videoId && modProjectId) {
        affectedModIds.add(modProjectId);
        const accessSnap = await adminDb.collection('youtuber_mod_access')
            .where('modProjectId', '==', modProjectId)
            .where('userId', '==', userId)
            .get();

        for (const aDoc of accessSnap.docs) {
            const data = aDoc.data() as YoutuberModAccess;
            const sources = data.grantSources || [];
            const remainingSources = sources.filter((s) => s.videoId !== videoId);
            if (remainingSources.length !== sources.length) {
                const newStatus = (remainingSources.length > 0 || data.manualDecision === 'FORCE_ALLOW') && data.manualDecision !== 'FORCE_DENY'
                    ? 'ACTIVE'
                    : 'REVOKED';
                await aDoc.ref.update({
                    grantSources: remainingSources,
                    status: newStatus,
                    syncStatus: 'PENDING',
                    updatedAt: now
                });
            } else if (!data.grantSources && data.grantType === 'VIDEO_ASSIGNMENT' && data.manualDecision !== 'FORCE_ALLOW') {
                await aDoc.ref.update({ status: 'REVOKED', syncStatus: 'PENDING', updatedAt: now });
            }
        }
    } else if (action === 'ASSIGNMENT_DELETED' && assignmentId) {
        const accessSnap = await adminDb.collection('youtuber_mod_access').where('userId', '==', userId).get();
        for (const aDoc of accessSnap.docs) {
            const data = aDoc.data() as YoutuberModAccess;
            const sources = data.grantSources || [];
            const remainingSources = sources.filter((s) => s.sourceVideoAssignmentId !== assignmentId);
            if (remainingSources.length !== sources.length) {
                const newStatus = (remainingSources.length > 0 || data.manualDecision === 'FORCE_ALLOW') && data.manualDecision !== 'FORCE_DENY'
                    ? 'ACTIVE'
                    : 'REVOKED';
                await aDoc.ref.update({
                    grantSources: remainingSources,
                    status: newStatus,
                    syncStatus: 'PENDING',
                    updatedAt: now
                });
                affectedModIds.add(data.modProjectId);
            } else if (data.sourceVideoAssignmentId === assignmentId && data.manualDecision !== 'FORCE_ALLOW') {
                await aDoc.ref.update({ status: 'REVOKED', syncStatus: 'PENDING', updatedAt: now });
                affectedModIds.add(data.modProjectId);
            }
        }
    } else if ((action === 'YOUTUBER_DELETED' || action === 'YOUTUBER_DEACTIVATED') && youtuberId) {
        const accessSnap = await adminDb.collection('youtuber_mod_access')
            .where('youtuberId', '==', youtuberId)
            .where('userId', '==', userId)
            .get();

        for (const aDoc of accessSnap.docs) {
            const data = aDoc.data() as YoutuberModAccess;
            affectedModIds.add(data.modProjectId);
            if (action === 'YOUTUBER_DELETED') {
                await aDoc.ref.update({
                    status: 'REVOKED',
                    syncStatus: 'PENDING',
                    revokedAt: now,
                    revokeReason: 'YouTuber silindi.',
                    updatedAt: now
                });
            }
        }
    }

    // Queue and immediately process sync jobs for all affected active mods
    const queuedJobIds: string[] = [];
    for (const mId of affectedModIds) {
        const modSnap = await adminDb.collection('mod_projects').doc(mId).get();
        if (!modSnap.exists || !modSnap.data()?.isActive || modSnap.data()?.isArchived) continue;

        try {
            const job = await createOrCoalesceSyncJob(mId, userId, 'LIFECYCLE_CASCADE');
            queuedJobIds.push(job.id);
            await processSyncJob(job.id, 'lifecycle-worker');
        } catch (jobErr) {
            console.warn(`[cascadeSync] Job for ${mId} failed:`, jobErr);
        }
    }

    return { affectedModIds: Array.from(affectedModIds), queuedJobIds };
}

/**
 * Hard-deletes a mod project and all its related BlumeCore data.
 * CRITICAL INVARIANT: NEVER modifies or deletes the GitHub repository or README.
 */
export async function deleteModProject(
    modProjectId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    const modRef = adminDb.collection('mod_projects').doc(modProjectId);
    const modSnap = await modRef.get();
    if (!modSnap.exists) {
        throw new Error('Mod projesi bulunamadı.');
    }
    const mod = { id: modSnap.id, ...modSnap.data() } as ModProject;
    if (mod.userId !== userId) {
        throw new Error('Bu işlem için yetkiniz yok.');
    }

    const now = Date.now();

    // 1. Delete video_mod_projects connections
    const videoLinksSnap = await adminDb
        .collection('video_mod_projects')
        .where('modProjectId', '==', modProjectId)
        .get();
    for (const d of videoLinksSnap.docs) {
        await d.ref.delete();
    }

    // 2. Delete youtuber_mod_access records
    const accessSnap = await adminDb
        .collection('youtuber_mod_access')
        .where('modProjectId', '==', modProjectId)
        .get();
    for (const d of accessSnap.docs) {
        await d.ref.delete();
    }

    // 3. Delete mod_access_events
    const eventSnap = await adminDb
        .collection('mod_access_events')
        .where('modProjectId', '==', modProjectId)
        .get();
    for (const d of eventSnap.docs) {
        await d.ref.delete();
    }

    // 4. Handle github_sync_jobs:
    // PENDING jobs are removed; RUNNING jobs are safely marked CANCELLED
    const jobsSnap = await adminDb
        .collection('github_sync_jobs')
        .where('modProjectId', '==', modProjectId)
        .get();
    for (const d of jobsSnap.docs) {
        const jData = d.data();
        if (jData.status === 'RUNNING') {
            await d.ref.update({
                status: 'CANCELLED',
                lockedAt: null,
                lockedBy: null,
                updatedAt: now
            });
        } else {
            await d.ref.delete();
        }
    }

    // 5. Delete github_sync_runs
    const runsSnap = await adminDb
        .collection('github_sync_runs')
        .where('modProjectId', '==', modProjectId)
        .get();
    for (const d of runsSnap.docs) {
        await d.ref.delete();
    }

    // 6. Delete mod_projects record itself
    await modRef.delete();

    // 7. Audit log
    await logAudit({
        eventType: 'MOD_DELETED',
        actorUserId: userId,
        timestamp: now,
        modId: mod.modKey,
        owner: mod.githubOwner
    });

    return { success: true };
}

export interface ArchivedCleanupPreviewItem {
    id: string;
    modKey: string;
    displayName: string;
    videoCount: number;
    accessCount: number;
    jobCount: number;
}

export interface ArchivedCleanupPreview {
    archivedMods: ArchivedCleanupPreviewItem[];
    totalMods: number;
    totalVideos: number;
    totalAccesses: number;
    totalJobs: number;
}

/**
 * Previews stale archived mod projects and their associated data for cleanup.
 */
export async function previewArchivedModsCleanup(userId: string): Promise<ArchivedCleanupPreview> {
    const snap = await adminDb
        .collection('mod_projects')
        .where('userId', '==', userId)
        .get();

    const archivedDocs = snap.docs.filter((d) => {
        const data = d.data() as ModProject;
        return data.isArchived === true || data.lifecycleStatus === 'ARCHIVED' || data.isActive === false;
    });

    const items: ArchivedCleanupPreviewItem[] = [];
    let totalVideos = 0;
    let totalAccesses = 0;
    let totalJobs = 0;

    for (const doc of archivedDocs) {
        const data = doc.data() as ModProject;
        const [vSnap, aSnap, jSnap] = await Promise.all([
            adminDb.collection('video_mod_projects').where('modProjectId', '==', doc.id).get(),
            adminDb.collection('youtuber_mod_access').where('modProjectId', '==', doc.id).get(),
            adminDb.collection('github_sync_jobs').where('modProjectId', '==', doc.id).get()
        ]);

        const videoCount = vSnap.size;
        const accessCount = aSnap.size;
        const jobCount = jSnap.size;

        totalVideos += videoCount;
        totalAccesses += accessCount;
        totalJobs += jobCount;

        items.push({
            id: doc.id,
            modKey: data.modKey,
            displayName: data.displayName || data.modKey,
            videoCount,
            accessCount,
            jobCount
        });
    }

    return {
        archivedMods: items,
        totalMods: items.length,
        totalVideos,
        totalAccesses,
        totalJobs
    };
}

/**
 * Permanently cleans up all stale archived mod projects and relations.
 * CRITICAL INVARIANT: NEVER modifies or deletes GitHub repositories or READMEs.
 */
export async function executeArchivedModsCleanup(userId: string): Promise<{
    success: boolean;
    deletedModCount: number;
    deletedModKeys: string[];
}> {
    const preview = await previewArchivedModsCleanup(userId);
    const deletedModKeys: string[] = [];

    for (const item of preview.archivedMods) {
        await deleteModProject(item.id, userId);
        deletedModKeys.push(item.modKey);
    }

    return {
        success: true,
        deletedModCount: deletedModKeys.length,
        deletedModKeys
    };
}

