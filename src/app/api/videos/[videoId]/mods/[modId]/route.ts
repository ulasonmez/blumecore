import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ videoId: string; modId: string }> }
) {
    try {
        const { videoId, modId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

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

        return NextResponse.json({ success: true, message: 'Mod bağlantısı kaldırıldı. (YouTuber erişimleri korundu).' });
    } catch (err: unknown) {
        console.error('Error in DELETE /api/videos/[videoId]/mods/[modId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Bağlantı kaldırılırken sunucu hatası oluştu.' }, { status: 500 });
    }
}
