import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { checkModDrift } from '@/lib/mods/mod-service';
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

        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists) {
            return NextResponse.json({ error: 'Mod bulunamadı.' }, { status: 404 });
        }

        if (!authUser.isSystemAdmin && modSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu mod için erişim yetkiniz yok.' }, { status: 403 });
        }

        const drift = await checkModDrift(modId, userId);

        return NextResponse.json({ data: drift });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods/[modId]/drift-check:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Drift kontrolü sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
