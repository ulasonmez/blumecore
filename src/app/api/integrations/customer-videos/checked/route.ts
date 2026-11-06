import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireCustomerVideoSyncSecret } from '@/lib/server-auth';
import { parseCheckedAssignmentIds } from '@/lib/customer-video-sync';

export const dynamic = 'force-dynamic';

/**
 * Apps Script'in kanalı taradığı atamaları işaretler (`customerVideoLastCheckedAt`).
 * Bir sonraki kontrol zamanı bu tarihe ve satış yaşına göre hesaplanır.
 * Gövde: { assignmentIds: string[] } (en fazla 200). Sahibe ait olmayan/bulunamayan kimlikler atlanır.
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
    const parsed = parseCheckedAssignmentIds(body);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
        const refs = parsed.ids.map(id => adminDb.collection('assignments').doc(id));
        const snaps = await adminDb.getAll(...refs);
        const now = Date.now();
        const batch = adminDb.batch();
        let updated = 0;
        const skipped: string[] = [];
        for (const snap of snaps) {
            if (!snap.exists || snap.data()?.userId !== ownerUid) {
                skipped.push(snap.id);
                continue;
            }
            batch.update(snap.ref, { customerVideoLastCheckedAt: now });
            updated++;
        }
        if (updated > 0) await batch.commit();
        return NextResponse.json({ updated, skipped, checkedAt: now });
    } catch (err: unknown) {
        console.error('Error in POST /api/integrations/customer-videos/checked:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Kontrol zamanı kaydedilemedi.' }, { status: 500 });
    }
}
