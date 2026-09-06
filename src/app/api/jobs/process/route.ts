import { NextRequest, NextResponse } from 'next/server';
import { processSyncJob } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Geçersiz veya eksik oturum.' }, { status: 401 });
        }

        const body = await request.json();
        const { jobId } = body;
        if (!jobId) {
            return NextResponse.json({ error: 'jobId parametresi gereklidir.' }, { status: 400 });
        }

        // Verify job ownership unless system admin
        if (!authUser.isSystemAdmin) {
            const jobSnap = await getDoc(doc(db, 'github_sync_jobs', jobId));
            if (!jobSnap.exists()) {
                return NextResponse.json({ error: 'İş kaydı bulunamadı.' }, { status: 404 });
            }
            if (jobSnap.data().userId !== authUser.userId) {
                return NextResponse.json({ error: 'Bu işi çalıştırma yetkiniz yok.' }, { status: 403 });
            }
        }

        const result = await processSyncJob(jobId, authUser.isSystemAdmin ? 'system-worker' : 'user-worker');

        return NextResponse.json({ data: result });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'İş çalıştırılırken hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
