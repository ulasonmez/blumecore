import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { ModProject, resolveModLifecycleStatus, YoutuberModAccess, ModAccessSource } from '@/lib/mods/types';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const videoRef = adminDb.collection('youtube_videos').doc(videoId);
        const videoSnap = await videoRef.get();
        if (!videoSnap.exists) {
            return NextResponse.json({ error: 'Video bulunamadı.' }, { status: 404 });
        }

        const videoData = videoSnap.data();
        if (videoData?.userId !== userId) {
            return NextResponse.json({ error: 'Bu video için silme yetkiniz yok.' }, { status: 403 });
        }

        const queuedJobIds: string[] = [];
        const affectedModIds = new Set<string>();
        const now = Date.now();

        await adminDb.runTransaction(async (tx) => {
            // 1. Find all mod links for this video
            const linksSnap = await adminDb
                .collection('video_mod_projects')
                .where('videoId', '==', videoId)
                .where('userId', '==', userId)
                .get();

            for (const linkDoc of linksSnap.docs) {
                const linkData = linkDoc.data();
                const mId = linkData.modProjectId;

                // 2. Find YouTuber mod access records that cite this videoId in grantSources
                const accessSnap = await adminDb
                    .collection('youtuber_mod_access')
                    .where('modProjectId', '==', mId)
                    .where('userId', '==', userId)
                    .get();

                for (const aDoc of accessSnap.docs) {
                    const access = aDoc.data() as YoutuberModAccess;
                    const currentSources: ModAccessSource[] = access.grantSources || [];
                    const updatedSources = currentSources.filter((s) => s.videoId !== videoId);

                    // If manually granted, keep ACTIVE
                    const isManual = access.manualDecision === 'FORCE_ALLOW';

                    if (updatedSources.length === 0 && !isManual) {
                        // Revoke access
                        tx.update(aDoc.ref, {
                            status: 'REVOKED',
                            grantSources: updatedSources,
                            updatedAt: now
                        });
                        affectedModIds.add(mId);
                    } else if (updatedSources.length !== currentSources.length) {
                        // Update remaining sources
                        tx.update(aDoc.ref, {
                            grantSources: updatedSources,
                            updatedAt: now
                        });
                    }
                }

                // Delete video-mod link
                tx.delete(linkDoc.ref);
            }

            // 3. Delete any assignments associated with this video
            const assignSnap = await adminDb
                .collection('assignments')
                .where('videoId', '==', videoId)
                .where('userId', '==', userId)
                .get();

            for (const aDoc of assignSnap.docs) {
                tx.delete(aDoc.ref);
            }

            // 4. Create sync jobs for affected active mods
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

            // 5. Delete video document
            tx.delete(videoRef);
        });

        // Trigger worker in background using after()
        if (queuedJobIds.length > 0) {
            try {
                after(async () => {
                    const { processSyncJob } = await import('@/lib/mods/mod-service');
                    for (const jId of queuedJobIds) {
                        try {
                            await processSyncJob(jId, 'video-delete-worker');
                        } catch (jobErr) {
                            console.warn(`[video-delete] Job ${jId} failed:`, jobErr);
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
            message: 'Video başarıyla silindi ve etkilenen mod erişimleri senkronizasyon kuyruğuna alındı.'
        });
    } catch (err: unknown) {
        console.error('Error in DELETE /api/videos/[videoId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Video silinirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
