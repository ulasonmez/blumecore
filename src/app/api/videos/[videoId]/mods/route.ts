import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { ModProject, VideoModProject } from '@/lib/mods/types';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function GET(
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

        const linkSnap = await adminDb
            .collection('video_mod_projects')
            .where('videoId', '==', videoId)
            .where('userId', '==', userId)
            .get();

        const mods: (ModProject & { linkId: string })[] = [];
        for (const lDoc of linkSnap.docs) {
            const linkData = lDoc.data() as VideoModProject;
            const modSnap = await adminDb.collection('mod_projects').doc(linkData.modProjectId).get();
            if (modSnap.exists) {
                mods.push({
                    id: modSnap.id,
                    linkId: lDoc.id,
                    ...(modSnap.data() as Omit<ModProject, 'id'>)
                });
            }
        }

        return NextResponse.json({ data: mods });
    } catch (err: unknown) {
        console.error('Error in GET /api/videos/[videoId]/mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Bağlı modlar yüklenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}

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

        const { modProjectId } = body;

        if (!modProjectId || typeof modProjectId !== 'string') {
            return NextResponse.json({ error: 'modProjectId parametresi zorunludur.' }, { status: 400 });
        }

        // Verify video exists and belongs to user
        const videoSnap = await adminDb.collection('youtube_videos').doc(videoId).get();
        if (!videoSnap.exists || (!authUser.isSystemAdmin && videoSnap.data()?.userId !== userId)) {
            return NextResponse.json({ error: 'Video bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        // Verify mod exists and belongs to user
        const modSnap = await adminDb.collection('mod_projects').doc(modProjectId).get();
        if (!modSnap.exists || (!authUser.isSystemAdmin && modSnap.data()?.userId !== userId)) {
            return NextResponse.json({ error: 'Mod projesi bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        // Check if already linked
        const dupSnap = await adminDb
            .collection('video_mod_projects')
            .where('videoId', '==', videoId)
            .where('modProjectId', '==', modProjectId)
            .where('userId', '==', userId)
            .get();

        if (!dupSnap.empty) {
            return NextResponse.json({ error: 'Bu mod zaten bu videoya bağlı.' }, { status: 409 });
        }

        const newLink: Omit<VideoModProject, 'id'> = {
            videoId,
            modProjectId,
            userId,
            createdAt: Date.now()
        };

        const linkRef = await adminDb.collection('video_mod_projects').add(newLink);

        return NextResponse.json({
            data: {
                id: linkRef.id,
                ...newLink,
                mod: { id: modProjectId, ...modSnap.data() }
            }
        }, { status: 201 });
    } catch (err: unknown) {
        console.error('Error in POST /api/videos/[videoId]/mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod bağlanırken sunucu hatası oluştu.' }, { status: 500 });
    }
}
