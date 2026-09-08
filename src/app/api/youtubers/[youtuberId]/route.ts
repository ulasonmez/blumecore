import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { ModProject, resolveModLifecycleStatus, YoutuberModAccess } from '@/lib/mods/types';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string }> }
) {
    try {
        const { youtuberId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const youtuberRef = adminDb.collection('youtubers').doc(youtuberId);
        const youtuberSnap = await youtuberRef.get();
        if (!youtuberSnap.exists) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        const youtuberData = youtuberSnap.data();
        if (youtuberData?.userId !== userId) {
            return NextResponse.json({ error: 'Bu YouTuber için silme yetkiniz yok.' }, { status: 403 });
        }

        const queuedJobIds: string[] = [];
        const affectedModIds = new Set<string>();
        const now = Date.now();

        await adminDb.runTransaction(async (tx) => {
            // 1. Delete player associations for this YouTuber
            const assocSnap = await adminDb
                .collection('youtuber_minecraft_players')
                .where('youtuberId', '==', youtuberId)
                .where('userId', '==', userId)
                .get();

            for (const aDoc of assocSnap.docs) {
                tx.delete(aDoc.ref);
            }

            // 2. Delete / revoke mod access records for this YouTuber
            const accessSnap = await adminDb
                .collection('youtuber_mod_access')
                .where('youtuberId', '==', youtuberId)
                .where('userId', '==', userId)
                .get();

            for (const accDoc of accessSnap.docs) {
                const accData = accDoc.data() as YoutuberModAccess;
                affectedModIds.add(accData.modProjectId);
                tx.delete(accDoc.ref);
            }

            // 3. Create sync jobs for affected active mods
            for (const mId of affectedModIds) {
                const modSnap = await adminDb.collection('mod_projects').doc(mId).get();
                if (!modSnap.exists) continue;
                const mod = modSnap.data() as ModProject;
                if (resolveModLifecycleStatus(mod) !== 'ACTIVE') continue;

                // Check pending job to coalesce
                const pendingSnap = await adminDb
                    .collection('github_sync_jobs')
                    .where('modProjectId', '==', mId)
                    .where('userId', '==', userId)
                    .where('status', '==', 'PENDING')
                    .get();

                if (!pendingSnap.empty) {
                    queuedJobIds.push(pendingSnap.docs[0].id);
                    continue;
                }

                const jobRef = adminDb.collection('github_sync_jobs').doc();
                tx.set(jobRef, {
                    modProjectId: mId,
                    status: 'PENDING',
                    triggerType: 'LIFECYCLE_CASCADE',
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
                queuedJobIds.push(jobRef.id);
            }

            // 4. Delete YouTuber document
            tx.delete(youtuberRef);
        });

        // Trigger background worker using after()
        if (queuedJobIds.length > 0) {
            try {
                after(async () => {
                    const { processSyncJob } = await import('@/lib/mods/mod-service');
                    for (const jId of queuedJobIds) {
                        try {
                            await processSyncJob(jId, 'youtuber-delete-worker');
                        } catch (jobErr) {
                            console.warn(`[youtuber-delete] Job ${jId} failed:`, jobErr);
                        }
                    }
                });
            } catch {
                // Outside request context; cron will reconcile
            }
        }

        return NextResponse.json({
            success: true,
            syncState: 'QUEUED',
            affectedModCount: affectedModIds.size,
            queuedJobCount: queuedJobIds.length,
            queuedJobIds,
            message: 'YouTuber başarıyla silindi ve etkilenen mod allowlistleri senkronizasyon kuyruğuna alındı.'
        });
    } catch (err: unknown) {
        console.error('Error in DELETE /api/youtubers/[youtuberId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'YouTuber silinirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
