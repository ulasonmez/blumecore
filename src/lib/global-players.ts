import { adminDb } from './firebase-admin';
import { normalizeUuid } from './minecraft-players';
import { GlobalMinecraftPlayer, ModProject, resolveModLifecycleStatus } from './mods/types';

export const BLUME_GLOBAL_UUID = normalizeUuid('058aa284-c0cf-4826-beae-9df1cb411623');
export const BLUME_GLOBAL_PLAYER_ID = 'blume-global-core-player';
export const BLUME_GLOBAL_USERNAME = 'BlumeCore';

export interface RequiredGlobalPlayer {
    id: string;
    nickname: string;
    uuid: string;
    protected: boolean;
    isActive: boolean;
}

export const REQUIRED_GLOBAL_PLAYERS: RequiredGlobalPlayer[] = [
    {
        id: 'blume',
        nickname: 'Blume',
        uuid: '058aa284-c0cf-4826-beae-9df1cb411623',
        protected: true,
        isActive: true
    }
];

/**
 * Fetches all active global Minecraft players.
 * Combines built-in REQUIRED_GLOBAL_PLAYERS (such as Blume UUID) with the
 * dedicated Firestore globalMinecraftPlayers collection, deduplicating by UUID.
 * Guarantees that even if Firestore is empty or unseeded, Blume UUID is always present.
 */
export async function getGlobalMinecraftPlayersAdmin(): Promise<GlobalMinecraftPlayer[]> {
    const players: GlobalMinecraftPlayer[] = [];
    const seenUuids = new Set<string>();

    // 1. Built-in required global players
    for (const req of REQUIRED_GLOBAL_PLAYERS) {
        if (req.isActive) {
            const canonical = normalizeUuid(req.uuid);
            seenUuids.add(canonical);
            players.push({
                id: req.id,
                username: req.nickname,
                uuid: canonical,
                isActive: true,
                description: 'Built-in Global Blume Player',
                createdAt: 0,
                updatedAt: 0
            });
        }
    }

    // 2. Fetch from Firestore globalMinecraftPlayers
    try {
        const snap = await adminDb
            .collection('globalMinecraftPlayers')
            .where('isActive', '==', true)
            .get();

        snap.forEach((doc) => {
            const data = doc.data() as Omit<GlobalMinecraftPlayer, 'id'>;
            const canonical = normalizeUuid(data.uuid);
            if (!seenUuids.has(canonical)) {
                seenUuids.add(canonical);
                players.push({
                    id: doc.id,
                    ...data,
                    uuid: canonical
                });
            }
        });
    } catch (err) {
        console.warn('[getGlobalMinecraftPlayersAdmin] Warning loading from Firestore:', err);
    }

    return players;
}

/**
 * Backfills Global Blume UUID to all active mods by queuing outbox GitHubSyncJobs.
 */
export async function backfillGlobalBlumeUuidToAllActiveMods(
    userId?: string
): Promise<{ modCount: number; queuedJobIds: string[]; syncState?: string }> {
    let q = adminDb.collection('mod_projects');
    let snap: FirebaseFirestore.QuerySnapshot;

    if (userId) {
        snap = await q.where('userId', '==', userId).get();
    } else {
        snap = await q.get();
    }

    const { createOrCoalesceSyncJob, processSyncJob } = await import('./mods/mod-service');
    const queuedJobIds: string[] = [];
    const activeModIds: string[] = [];

    for (const doc of snap.docs) {
        const mod = { id: doc.id, ...doc.data() } as ModProject;
        if (resolveModLifecycleStatus(mod) === 'ACTIVE') {
            activeModIds.push(mod.id);
            const job = await createOrCoalesceSyncJob(mod.id, mod.userId, 'MOD_BACKFILL');
            queuedJobIds.push(job.id);
        }
    }

    // Best-effort trigger using after() if running in request context; cron guarantees reconciliation
    if (queuedJobIds.length > 0) {
        try {
            const { after } = await import('next/server');
            after(async () => {
                for (const jId of queuedJobIds) {
                    try {
                        await processSyncJob(jId, 'backfill-worker');
                    } catch (e) {
                        console.warn(`[backfill] Job ${jId} failed:`, e);
                    }
                }
            });
        } catch {
            // Not in request context; cron worker will reconcile
        }
    }

    return {
        modCount: activeModIds.length,
        queuedJobIds,
        syncState: 'QUEUED' as const
    };
}
