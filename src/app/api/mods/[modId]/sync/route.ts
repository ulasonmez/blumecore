import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { createOrCoalesceSyncJob, processSyncJob } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        const modRef = doc(db, 'mod_projects', modId);
        const modSnap = await getDoc(modRef);
        if (!modSnap.exists()) {
            return NextResponse.json({ error: 'Mod bulunamadı.' }, { status: 404 });
        }

        if (!authUser.isSystemAdmin && modSnap.data().userId !== userId) {
            return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const triggerType = body.triggerType || 'MANUAL_SYNC';

        const job = await createOrCoalesceSyncJob(modId, userId, triggerType);
        const execResult = await processSyncJob(job.id);

        if (!execResult.success) {
            return NextResponse.json({
                error: execResult.message,
                data: { jobId: job.id, ...execResult }
            }, { status: 422 });
        }

        return NextResponse.json({
            data: {
                jobId: job.id,
                ...execResult
            }
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/[modId]/sync:', err);
        const message = err instanceof Error ? err.message : 'Senkronizasyon başlatılırken hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
