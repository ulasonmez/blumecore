import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { syncActiveModsForYoutuberChange } from '@/lib/mods/mod-service';

export async function POST(
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

        // Verify YouTuber exists and belongs to user
        const youtuberSnap = await adminDb.collection('youtubers').doc(youtuberId).get();
        if (!youtuberSnap.exists) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        if (youtuberSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const summary = await syncActiveModsForYoutuberChange({
            youtuberId,
            userId,
            triggerType: 'MANUAL_SYNC',
            processImmediately: true
        });

        return NextResponse.json({
            success: true,
            affectedModCount: summary.affectedModCount,
            queuedJobCount: summary.queuedJobCount,
            coalescedJobCount: summary.coalescedJobCount,
            legacyConflicts: summary.legacyConflicts
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/youtubers/[youtuberId]/sync-mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod senkronizasyonu başlatılırken hata oluştu.' }, { status: 500 });
    }
}
