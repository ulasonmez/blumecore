import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { createOrCoalesceSyncJob, processSyncJob } from '@/lib/mods/mod-service';
import { requireOwnerUser } from '@/lib/server-auth';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists) {
            return NextResponse.json({ error: 'Mod bulunamadı.' }, { status: 404 });
        }

        if (modSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu mod üzerinde senkronizasyon yetkiniz yok.' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const triggerType = body.triggerType || 'MANUAL_SYNC';

        const job = await createOrCoalesceSyncJob(modId, userId, triggerType);
        const execResult = await processSyncJob(job.id);

        if (!execResult.success) {
            return NextResponse.json({
                error: execResult.message,
                syncState: 'FAILED',
                data: { jobId: job.id, ...execResult }
            }, { status: 422 });
        }

        return NextResponse.json({
            syncState: 'SUCCESS',
            data: {
                jobId: job.id,
                ...execResult
            }
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/[modId]/sync:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Senkronizasyon başlatılırken sunucu hatası oluştu.' }, { status: 500 });
    }
}
