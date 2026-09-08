import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerUser } from '@/lib/server-auth';
import { backfillGlobalBlumeUuidToAllActiveMods } from '@/lib/global-players';

export async function POST(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }

        const result = await backfillGlobalBlumeUuidToAllActiveMods(auth.user.userId);

        return NextResponse.json({
            success: true,
            syncState: 'QUEUED',
            message: `${result.modCount} aktif mod için Global Blume UUID senkronizasyonu kuyruğa alındı.`,
            queuedJobCount: result.queuedJobIds.length,
            queuedJobIds: result.queuedJobIds
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/global-backfill:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Global Blume UUID backfill işlemi sırasında hata oluştu.' }, { status: 500 });
    }
}
