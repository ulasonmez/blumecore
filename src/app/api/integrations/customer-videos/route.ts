import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireCustomerVideoSyncSecret } from '@/lib/server-auth';
import { logAudit } from '@/lib/audit-log';
import {
    CustomerVideoDecision,
    decideCustomerVideoUpdate,
    parseCustomerVideoSubmission,
    resolveAutoThreshold
} from '@/lib/customer-video-sync';

export const dynamic = 'force-dynamic';

class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

/**
 * Apps Script'in bulduğu müşteri videosunu bildirir.
 * Gövde: { assignmentId, customerVideoUrl, confidence (0-1), matchedTitle?, reason? }
 * Yalnızca bağlantısı boş atamaya yazar; eşik altı güvenler öneri olarak kaydedilir.
 * Sonuçlar idempotenttir: aynı istek tekrarlanırsa belge yeniden değişmez.
 */
export async function POST(request: NextRequest) {
    const auth = requireCustomerVideoSyncSecret(request);
    if (!auth.ok) return auth.response;

    const ownerUid = process.env.ADMIN_FIREBASE_UID;
    if (!ownerUid) {
        return NextResponse.json({ error: 'Sunucu yapılandırması eksik: ADMIN_FIREBASE_UID.' }, { status: 503 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Geçersiz JSON.' }, { status: 400 });
    }

    const parsed = parseCustomerVideoSubmission(body);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const submission = parsed.submission;
    const threshold = resolveAutoThreshold(process.env.CUSTOMER_VIDEO_AUTO_THRESHOLD);
    const now = Date.now();
    const assignmentRef = adminDb.collection('assignments').doc(submission.assignmentId);

    let decision: CustomerVideoDecision;
    let youtuberId: string | undefined;
    try {
        decision = await adminDb.runTransaction(async (tx) => {
            const snap = await tx.get(assignmentRef);
            if (!snap.exists) throw new HttpError(404, 'Atama bulunamadı.');
            const data = snap.data() ?? {};
            if (data.userId !== ownerUid) throw new HttpError(404, 'Atama bulunamadı.');
            youtuberId = typeof data.youtuberId === 'string' ? data.youtuberId : undefined;

            const result = decideCustomerVideoUpdate(data, submission, threshold, now);
            if (result.set) {
                const patch: Record<string, unknown> = { ...result.set };
                for (const field of result.remove) patch[field] = FieldValue.delete();
                tx.update(assignmentRef, patch);
            }
            return result;
        });
    } catch (err: unknown) {
        if (err instanceof HttpError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('Error in POST /api/integrations/customer-videos:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Müşteri videosu kaydedilemedi.' }, { status: 500 });
    }

    if (decision.outcome === 'AUTO_SET' || decision.outcome === 'SUGGESTED') {
        await logAudit({
            eventType: decision.outcome === 'AUTO_SET' ? 'CUSTOMER_VIDEO_AUTO_SET' : 'CUSTOMER_VIDEO_SUGGESTED',
            actorUserId: 'apps-script',
            timestamp: now,
            youtuberId,
            details: {
                assignmentId: submission.assignmentId,
                videoId: submission.videoId,
                confidence: submission.confidence,
                threshold
            }
        });
    }

    return NextResponse.json({
        assignmentId: submission.assignmentId,
        outcome: decision.outcome,
        customerVideoUrl: submission.url,
        threshold
    });
}
