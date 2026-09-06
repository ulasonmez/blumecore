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

        const body = await request.json();
        const { youtuberId, sourceVideoAssignmentId } = body;

        if (!youtuberId) {
            return NextResponse.json({ error: 'youtuberId gereklidir.' }, { status: 400 });
        }

        const result = await handleVideoAssignmentModAccess(
            videoId,
            youtuberId,
            userId,
            sourceVideoAssignmentId
        );

        return NextResponse.json({ data: result });
    } catch (err: unknown) {
        console.error('Error in POST /api/videos/[videoId]/assign-access:', err);
        const message = err instanceof Error ? err.message : 'Atama mod erişimi işlemi sırasında hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
