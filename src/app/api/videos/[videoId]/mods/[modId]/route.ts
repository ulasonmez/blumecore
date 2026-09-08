import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ videoId: string; modId: string }> }
) {
    try {
        const { videoId, modId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const linkSnap = await adminDb
            .collection('video_mod_projects')
            .where('videoId', '==', videoId)
            .where('modProjectId', '==', modId)
            .where('userId', '==', userId)
            .get();

        if (linkSnap.empty) {
            return NextResponse.json({ error: 'Video-mod bağlantısı bulunamadı.' }, { status: 404 });
        }

        for (const lDoc of linkSnap.docs) {
            await adminDb.collection('video_mod_projects').doc(lDoc.id).delete();
        }

        // Recalculate affected accesses and sync mod if access revoked
        const { recalculateCascadeAccess } = await import('@/lib/mods/mod-service');
        const cascadeResult = await recalculateCascadeAccess({
            userId,
            action: 'VIDEO_MOD_UNLINKED',
            videoId,
            modProjectId: modId
        });

        return NextResponse.json({
            success: true,
            message: 'Mod bağlantısı kaldırıldı ve erişimler yeniden hesaplandı.',
            data: cascadeResult
        });
    } catch (err: unknown) {
        console.error('Error in DELETE /api/videos/[videoId]/mods/[modId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Bağlantı kaldırılırken sunucu hatası oluştu.' }, { status: 500 });
    }
}
