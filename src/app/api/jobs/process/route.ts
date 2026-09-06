import { NextRequest, NextResponse } from 'next/server';
import { processSyncJob } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Geçersiz veya eksik oturum.' }, { status: 401 });
        }

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

        const { jobId } = body;
        if (!jobId || typeof jobId !== 'string') {
            return NextResponse.json({ error: 'jobId parametresi gereklidir.' }, { status: 400 });
        }

        // Verify job ownership unless system admin
        if (!authUser.isSystemAdmin) {
            const jobSnap = await adminDb.collection('github_sync_jobs').doc(jobId).get();
            if (!jobSnap.exists) {
                return NextResponse.json({ error: 'İş kaydı bulunamadı.' }, { status: 404 });
            }
            if (jobSnap.data()?.userId !== authUser.userId) {
                return NextResponse.json({ error: 'Bu işi çalıştırma yetkiniz yok.' }, { status: 403 });
            }
        }

        const result = await processSyncJob(jobId, authUser.isSystemAdmin ? 'system-worker' : 'user-worker');

        return NextResponse.json({ data: result });
    } catch (err: unknown) {
        console.error('Error in POST /api/jobs/process:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'İş çalıştırılırken sunucu hatası oluştu.' }, { status: 500 });
    }
}
