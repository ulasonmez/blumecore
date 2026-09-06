import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, getDoc } from 'firebase/firestore';
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

        const qLinks = query(
            collection(db, 'video_mod_projects'),
            where('videoId', '==', videoId),
            where('userId', '==', userId)
        );
        const linkSnap = await getDocs(qLinks);

        const mods: (ModProject & { linkId: string })[] = [];
        for (const lDoc of linkSnap.docs) {
            const linkData = lDoc.data() as VideoModProject;
            const modSnap = await getDoc(doc(db, 'mod_projects', linkData.modProjectId));
            if (modSnap.exists()) {
                mods.push({
                    id: modSnap.id,
                    linkId: lDoc.id,
                    ...(modSnap.data() as Omit<ModProject, 'id'>)
                });
            }
        }

        return NextResponse.json({ data: mods });
    } catch (err: unknown) {
        console.error('Error in GET /api/videos/[videoId]/mods:', err);
        return NextResponse.json({ error: 'Bağlı modlar yüklenirken hata oluştu.' }, { status: 500 });
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

        const body = await request.json();
        const { modProjectId } = body;

        if (!modProjectId) {
            return NextResponse.json({ error: 'modProjectId parametresi zorunludur.' }, { status: 400 });
        }

        // Verify video exists and belongs to user
        const videoSnap = await getDoc(doc(db, 'youtube_videos', videoId));
        if (!videoSnap.exists() || videoSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Video bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        // Verify mod exists and belongs to user
        const modSnap = await getDoc(doc(db, 'mod_projects', modProjectId));
        if (!modSnap.exists() || modSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Mod projesi bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        // Check if already linked
        const qDup = query(
            collection(db, 'video_mod_projects'),
            where('videoId', '==', videoId),
            where('modProjectId', '==', modProjectId),
            where('userId', '==', userId)
        );
        const dupSnap = await getDocs(qDup);
        if (!dupSnap.empty) {
            return NextResponse.json({ error: 'Bu mod zaten bu videoya bağlı.' }, { status: 409 });
        }

        const newLink: Omit<VideoModProject, 'id'> = {
            videoId,
            modProjectId,
            userId,
            createdAt: Date.now()
        };

        const linkRef = await addDoc(collection(db, 'video_mod_projects'), newLink);

        return NextResponse.json({
            data: {
                id: linkRef.id,
                ...newLink,
                mod: { id: modProjectId, ...modSnap.data() }
            }
        }, { status: 201 });
    } catch (err: unknown) {
        console.error('Error in POST /api/videos/[videoId]/mods:', err);
        const message = err instanceof Error ? err.message : 'Mod bağlanırken hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
