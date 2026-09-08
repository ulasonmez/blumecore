import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerUser } from '@/lib/server-auth';
import { recalculateCascadeAccess } from '@/lib/mods/mod-service';

/**
 * Manual Recovery / Admin tool for lifecycle cascade recalculation.
 * Exclusively accessible by the verified BlumeCore owner UID.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const effectiveUserId = auth.user.userId;

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

        const { action, videoId, modProjectId, assignmentId, youtuberId } = body;

        const validActions = [
            'VIDEO_DELETED',
            'VIDEO_MOD_UNLINKED',
            'ASSIGNMENT_DELETED',
            'YOUTUBER_DELETED',
            'YOUTUBER_DEACTIVATED'
        ];

        if (!action || typeof action !== 'string' || !validActions.includes(action)) {
            return NextResponse.json({ error: 'Geçersiz action türü.' }, { status: 400 });
        }

        const result = await recalculateCascadeAccess({
            userId: effectiveUserId,
            action: action as any,
            videoId: typeof videoId === 'string' ? videoId : undefined,
            modProjectId: typeof modProjectId === 'string' ? modProjectId : undefined,
            assignmentId: typeof assignmentId === 'string' ? assignmentId : undefined,
            youtuberId: typeof youtuberId === 'string' ? youtuberId : undefined
        });

        return NextResponse.json({
            success: true,
            isRecoveryRun: true,
            data: result
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/lifecycle/cascade-sync:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Kaskat senkronizasyon sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
