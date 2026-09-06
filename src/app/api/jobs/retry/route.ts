import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { processSyncJob } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Geçersiz veya eksik oturum.' }, { status: 401 });
        }

        const body = await request.json();
        const { jobId } = body;
        if (!jobId) {
            return NextResponse.json({ error: 'jobId gereklidir.' }, { status: 400 });
        }

        const jobRef = doc(db, 'github_sync_jobs', jobId);
        const jobSnap = await getDoc(jobRef);
        if (!jobSnap.exists()) {
            return NextResponse.json({ error: 'İş kaydı bulunamadı.' }, { status: 404 });
        }

        if (!authUser.isSystemAdmin && jobSnap.data()?.userId !== authUser.userId) {
            return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 403 });
        }

        // Reset status to PENDING so it can be claimed and processed
        await updateDoc(jobRef, {
            status: 'PENDING',
            nextAttemptAt: Date.now(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: Date.now()
        });

        const execResult = await processSyncJob(jobId, 'manual-retry');

        return NextResponse.json({ data: execResult });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'İş tekrar denenirken hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
