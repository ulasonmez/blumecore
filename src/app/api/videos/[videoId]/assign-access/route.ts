import { NextRequest, NextResponse } from 'next/server';
import { handleVideoAssignmentModAccess } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

        const { youtuberId, sourceVideoAssignmentId } = body;

        if (!youtuberId || typeof youtuberId !== 'string') {
            return NextResponse.json({ error: 'youtuberId gereklidir.' }, { status: 400 });
        }

        const result = await handleVideoAssignmentModAccess(
            videoId,
            youtuberId,
            userId,
            typeof sourceVideoAssignmentId === 'string' ? sourceVideoAssignmentId : undefined
        );

        return NextResponse.json({ data: result });
    } catch (err: unknown) {
        console.error('Error in POST /api/videos/[videoId]/assign-access:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Atama mod erişimi işlemi sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
