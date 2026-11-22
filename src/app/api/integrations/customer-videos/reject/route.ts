import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireCustomerVideoSyncSecret } from '@/lib/server-auth';
import { logAudit } from '@/lib/audit-log';
import {
    CustomerVideoRejectDecision,
    decideCustomerVideoRejection,
    parseCustomerVideoRejection
} from '@/lib/customer-video-sync';

export const dynamic = 'force-dynamic';

class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

/**
 * Sahibin Telegram'daki "yanlış eşleşme" butonu (Apps Script üzerinden).
 * Gövde: { assignmentId, videoId }. Video atamanın `customerVideoRejectedIds` listesine eklenir;
 * atamadaki bağlantı bu videoysa bağlantı ve otomatik eşleşme bilgisi silinir. İdempotenttir.
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

    const parsed = parseCustomerVideoRejection(body);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { assignmentId, videoId } = parsed.rejection;
    const now = Date.now();
    const assignmentRef = adminDb.collection('assignments').doc(assignmentId);

    let decision: CustomerVideoRejectDecision;
    let youtuberId: string | undefined;
    try {
        decision = await adminDb.runTransaction(async (tx) => {
            const snap = await tx.get(assignmentRef);
            if (!snap.exists) throw new HttpError(404, 'Atama bulunamadı.');
            const data = snap.data() ?? {};
            if (data.userId !== ownerUid) throw new HttpError(404, 'Atama bulunamadı.');
            youtuberId = typeof data.youtuberId === 'string' ? data.youtuberId : undefined;

            const result = decideCustomerVideoRejection(data, videoId);
            const patch: Record<string, unknown> = { ...(result.set ?? {}) };
            for (const field of result.remove) patch[field] = FieldValue.delete();
            if (Object.keys(patch).length > 0) tx.update(assignmentRef, patch);
            return result;
        });
    } catch (err: unknown) {
        if (err instanceof HttpError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('Error in POST /api/integrations/customer-videos/reject:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Ret kaydedilemedi.' }, { status: 500 });
    }

    if (decision.outcome !== 'ALREADY_REJECTED') {
        await logAudit({
            eventType: 'CUSTOMER_VIDEO_REJECTED',
            actorUserId: 'apps-script',
            timestamp: now,
            youtuberId,
            details: { assignmentId, videoId, linkRemoved: decision.outcome === 'REMOVED' }
        });
    }

    return NextResponse.json({
        assignmentId,
        videoId,
        outcome: decision.outcome,
        removedTitle: decision.removedTitle
    });
}
