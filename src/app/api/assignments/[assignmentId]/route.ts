import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { ModProject, resolveModLifecycleStatus, YoutuberModAccess, ModAccessSource } from '@/lib/mods/types';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ assignmentId: string }> }
) {
    try {
        const { assignmentId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const assignmentRef = adminDb.collection('assignments').doc(assignmentId);
        const assignmentSnap = await assignmentRef.get();
        if (!assignmentSnap.exists) {
            return NextResponse.json({ error: 'Takvim ataması bulunamadı.' }, { status: 404 });
        }

        const assignmentData = assignmentSnap.data();
        if (assignmentData?.userId !== userId) {
            return NextResponse.json({ error: 'Bu atamayı silme yetkiniz yok.' }, { status: 403 });
        }

        const queuedJobIds: string[] = [];
        const affectedModIds = new Set<string>();
        const now = Date.now();

        await adminDb.runTransaction(async (tx) => {
            const youtuberId = assignmentData?.youtuberId;

            if (youtuberId) {
                // Find YouTuber mod access records
                const accessSnap = await adminDb
                    .collection('youtuber_mod_access')
                    .where('youtuberId', '==', youtuberId)
                    .where('userId', '==', userId)
                    .get();

                for (const aDoc of accessSnap.docs) {
                    const access = aDoc.data() as YoutuberModAccess;

                    // Remove current assignment from grantSources
                    const currentSources: ModAccessSource[] = access.grantSources || [];
                    const updatedSources = currentSources.filter((s) => s.sourceVideoAssignmentId !== assignmentId);

                    // If manually granted, keep ACTIVE
                    const isManual = access.manualDecision === 'FORCE_ALLOW';

                    if (updatedSources.length === 0 && !isManual) {
                        // Revoke access
                        tx.update(aDoc.ref, {
                            status: 'REVOKED',
                            grantSources: updatedSources,
                            updatedAt: now
                        });
                        affectedModIds.add(access.modProjectId);
                    } else if (updatedSources.length !== currentSources.length) {
                        // Update remaining sources
                        tx.update(aDoc.ref, {
                            grantSources: updatedSources,
                            updatedAt: now
                        });
                    }
                }
            }

            // Create sync jobs for affected active mods
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

            // Delete assignment
            tx.delete(assignmentRef);
        });

        // Trigger worker in background using after()
        if (queuedJobIds.length > 0) {
            try {
                after(async () => {
                    const { processSyncJob } = await import('@/lib/mods/mod-service');
                    for (const jId of queuedJobIds) {
                        try {
                            await processSyncJob(jId, 'assignment-delete-worker');
                        } catch (jobErr) {
                            console.warn(`[assignment-delete] Job ${jId} failed:`, jobErr);
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
            message: 'Takvim ataması silindi ve etkilenen mod erişimleri senkronizasyon kuyruğuna alındı.'
        });
    } catch (err: unknown) {
        console.error('Error in DELETE /api/assignments/[assignmentId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Atama silinirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
