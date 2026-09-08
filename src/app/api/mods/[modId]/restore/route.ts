import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { restoreModProject } from '@/lib/mods/mod-service';

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

        const modRef = adminDb.collection('mod_projects').doc(modId);
        const modSnap = await modRef.get();
        if (!modSnap.exists) {
            return NextResponse.json({ error: 'Mod bulunamadı.' }, { status: 404 });
        }

        if (modSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const result = await restoreModProject(modId, userId);

        return NextResponse.json({
            success: true,
            archiveStatus: result.archiveStatus,
            message: 'Mod başarıyla aktifleştirildi ve güncel oyuncular ile senkronize edildi.'
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/[modId]/restore:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod geri yüklenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
