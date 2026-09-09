import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { ModProject } from '@/lib/mods/types';
import { requireOwnerUser } from '@/lib/server-auth';

export async function GET(
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

        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists) {
            return NextResponse.json({ error: 'Mod bulunamadı.' }, { status: 404 });
        }

        const modData = { id: modSnap.id, ...modSnap.data() } as ModProject;
        if (modData.userId !== userId) {
            return NextResponse.json({ error: 'Bu mod için erişim yetkiniz yok.' }, { status: 403 });
        }

        // Count connected videos
        const videoSnap = await adminDb
            .collection('video_mod_projects')
            .where('modProjectId', '==', modId)
            .get();
        const videoCount = videoSnap.size;

        // Count authorized youtubers
        const accessSnap = await adminDb
            .collection('youtuber_mod_access')
            .where('modProjectId', '==', modId)
            .where('status', '==', 'ACTIVE')
            .get();
        const authorizedYoutuberCount = accessSnap.size;

        // Fetch latest sync job
        const jobSnap = await adminDb
            .collection('github_sync_jobs')
            .where('modProjectId', '==', modId)
            .get();
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
        console.error('Error in GET /api/mods/[modId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod bilgileri alınırken sunucu hatası oluştu.' }, { status: 500 });
    }
}

export async function PATCH(
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

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

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

        await modRef.update(updates);

        return NextResponse.json({ data: { id: modId, ...modSnap.data(), ...updates } });
    } catch (err: unknown) {
        console.error('Error in PATCH /api/mods/[modId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod güncellenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}

export async function DELETE(
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

        // Hard delete mod and relations from BlumeCore (preserving GitHub repo)
        const { deleteModProject } = await import('@/lib/mods/mod-service');
        await deleteModProject(modId, userId);

        return NextResponse.json({
            success: true,
            message: 'Mod başarıyla BlumeCore veritabanından silindi.'
        });
    } catch (err: unknown) {
        console.error('Error in DELETE /api/mods/[modId]:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod silinirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
