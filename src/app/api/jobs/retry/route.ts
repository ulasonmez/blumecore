import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { processSyncJob } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

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
            return NextResponse.json({ error: 'jobId gereklidir.' }, { status: 400 });
        }

        const jobRef = adminDb.collection('github_sync_jobs').doc(jobId);
        const jobSnap = await jobRef.get();
        if (!jobSnap.exists) {
            return NextResponse.json({ error: 'İş kaydı bulunamadı.' }, { status: 404 });
        }

        if (!authUser.isSystemAdmin && jobSnap.data()?.userId !== authUser.userId) {
            return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 403 });
        }

        // Reset status to PENDING so it can be claimed and processed
        await jobRef.update({
            status: 'PENDING',
            nextAttemptAt: Date.now(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: Date.now()
        });

        const execResult = await processSyncJob(jobId, 'manual-retry');

        return NextResponse.json({ data: execResult });
    } catch (err: unknown) {
        console.error('Error in POST /api/jobs/retry:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'İş tekrar denenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
