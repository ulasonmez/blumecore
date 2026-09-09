import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerUser } from '@/lib/server-auth';
import {
    previewArchivedModsCleanup,
    executeArchivedModsCleanup
} from '@/lib/mods/mod-service';

export async function GET(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const preview = await previewArchivedModsCleanup(userId);

        return NextResponse.json({ data: preview });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods/cleanup-archived:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json(
            { error: 'Eski arşiv kayıtları önizlemesi alınırken hata oluştu.' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        let body: Record<string, unknown> = {};
        try {
            body = await request.json();
        } catch {
            // body optional or empty
        }

        if (body.confirm !== true) {
            return NextResponse.json(
                { error: 'Temizleme işlemini onaylamak için confirm: true gönderilmelidir.' },
                { status: 400 }
            );
        }

        const result = await executeArchivedModsCleanup(userId);

        return NextResponse.json({
            success: true,
            deletedModCount: result.deletedModCount,
            deletedModKeys: result.deletedModKeys,
            message: `${result.deletedModCount} eski arşiv kaydı ve ilişkileri BlumeCore'dan başarıyla temizlendi.`
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/cleanup-archived:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json(
            { error: 'Eski arşiv kayıtları temizlenirken hata oluştu.' },
            { status: 500 }
        );
    }
}
