import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ModProject } from '@/lib/mods/types';
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

        const modData = { id: modSnap.id, ...modSnap.data() } as ModProject;
        if (modData.userId !== userId) {
            return NextResponse.json({ error: 'Bu mod için erişim yetkiniz yok.' }, { status: 403 });
        }

        // Count connected videos
        const qVideos = query(collection(db, 'video_mod_projects'), where('modProjectId', '==', modId));
        const videoSnap = await getDocs(qVideos);
        const videoCount = videoSnap.size;

        // Count authorized youtubers
        const qAccess = query(
            collection(db, 'youtuber_mod_access'),
            where('modProjectId', '==', modId),
            where('status', '==', 'ACTIVE')
        );
        const accessSnap = await getDocs(qAccess);
        const authorizedYoutuberCount = accessSnap.size;

        // Fetch latest sync job
        const qJobs = query(
            collection(db, 'github_sync_jobs'),
            where('modProjectId', '==', modId)
        );
        const jobSnap = await getDocs(qJobs);
        let latestJob = null;
        if (!jobSnap.empty) {
            const jobs = jobSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            jobs.sort((a: any, b: any) => b.createdAt - a.createdAt);
            latestJob = jobs[0];
        }

        return NextResponse.json({
            data: {
                ...modData,
                videoCount,
                authorizedYoutuberCount,
                latestJob
            }
        });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods/[modId]:', err);
        return NextResponse.json({ error: 'Mod bilgileri alınırken hata oluştu.' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası.' }, { status: 401 });
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

        const body = await request.json();
        const updates: Partial<ModProject> = {
            updatedAt: Date.now()
        };

        if (typeof body.displayName === 'string' && body.displayName.trim()) {
            updates.displayName = body.displayName.trim();
        }
        if (typeof body.description === 'string') {
            updates.description = body.description.trim();
        }
        if (typeof body.branch === 'string' && body.branch.trim()) {
            updates.branch = body.branch.trim();
        }
        if (typeof body.allowlistPath === 'string' && body.allowlistPath.trim()) {
            updates.allowlistPath = body.allowlistPath.trim();
        }
        if (typeof body.isActive === 'boolean') {
            updates.isActive = body.isActive;
        }

        await updateDoc(modRef, updates);

        return NextResponse.json({ data: { id: modId, ...modSnap.data(), ...updates } });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Güncelleme hatası.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası.' }, { status: 401 });
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

        // Soft-delete: Mark as inactive and archived without deleting historical sync records
        await updateDoc(modRef, {
            isActive: false,
            isArchived: true,
            updatedAt: Date.now()
        });

        return NextResponse.json({ success: true, message: 'Mod başarıyla pasif/arşivlenmiş hale getirildi.' });
    } catch (err: unknown) {
        return NextResponse.json({ error: 'Mod pasif hale getirilirken hata oluştu.' }, { status: 500 });
    }
}
