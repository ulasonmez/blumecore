import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getLegacyUuidsForMod } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function GET(
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

        const legacyUuids = await getLegacyUuidsForMod(modId);

        return NextResponse.json({ data: legacyUuids });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Legacy UUID listesi alınırken hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
