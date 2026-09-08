import { adminDb } from './firebase-admin';
import { normalizeUuid } from './minecraft-players';
import { GlobalMinecraftPlayer, ModProject, resolveModLifecycleStatus } from './mods/types';

export const BLUME_GLOBAL_UUID = normalizeUuid('058aa284-c0cf-4826-beae-9df1cb411623');
export const BLUME_GLOBAL_PLAYER_ID = 'blume-global-core-player';
export const BLUME_GLOBAL_USERNAME = 'BlumeCore';

/**
 * Fetches all active global Minecraft players from the dedicated globalMinecraftPlayers collection.
 * If the collection is empty or does not contain the default Blume server UUID,
 * seeds the default Blume UUID automatically.
 */
export async function getGlobalMinecraftPlayersAdmin(): Promise<GlobalMinecraftPlayer[]> {
    const snap = await adminDb
        .collection('globalMinecraftPlayers')
        .where('isActive', '==', true)
        .get();

    const players: GlobalMinecraftPlayer[] = [];
    let hasDefaultBlumeUuid = false;

    snap.forEach((doc) => {
        const data = doc.data() as Omit<GlobalMinecraftPlayer, 'id'>;
        const canonical = normalizeUuid(data.uuid);
        if (canonical === BLUME_GLOBAL_UUID) {
            hasDefaultBlumeUuid = true;
        }
        players.push({
            id: doc.id,
            ...data,
            uuid: canonical
        });
    });

    if (!hasDefaultBlumeUuid) {
        // Auto-seed default Blume global UUID
        const now = Date.now();
        const defaultPlayer: Omit<GlobalMinecraftPlayer, 'id'> = {
            username: BLUME_GLOBAL_USERNAME,
            uuid: BLUME_GLOBAL_UUID,
            isActive: true,
            description: 'Global Blume Server UUID',
            createdAt: now,
            updatedAt: now
        };

        const docRef = adminDb.collection('globalMinecraftPlayers').doc(BLUME_GLOBAL_PLAYER_ID);
        await docRef.set(defaultPlayer, { merge: true });

        players.unshift({
            id: BLUME_GLOBAL_PLAYER_ID,
            ...defaultPlayer
        });
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
