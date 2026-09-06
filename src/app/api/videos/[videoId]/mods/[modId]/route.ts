import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
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

        const qLink = query(
            collection(db, 'video_mod_projects'),
            where('videoId', '==', videoId),
            where('modProjectId', '==', modId),
            where('userId', '==', userId)
        );
        const linkSnap = await getDocs(qLink);

        if (linkSnap.empty) {
            return NextResponse.json({ error: 'Video-mod bağlantısı bulunamadı.' }, { status: 404 });
        }

        for (const lDoc of linkSnap.docs) {
            await deleteDoc(doc(db, 'video_mod_projects', lDoc.id));
        }

        return NextResponse.json({ success: true, message: 'Mod bağlantısı kaldırıldı. (YouTuber erişimleri korundu).' });
    } catch (err: unknown) {
        return NextResponse.json({ error: 'Bağlantı kaldırılırken hata oluştu.' }, { status: 500 });
    }
}
