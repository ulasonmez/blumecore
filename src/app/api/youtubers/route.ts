import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const snap = await adminDb
            .collection('youtubers')
            .where('userId', '==', userId)
            .get();

        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return NextResponse.json({ data });
    } catch (err: unknown) {
        console.error('Error in GET /api/youtubers:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'YouTuberlar alınırken sunucu hatası oluştu.' }, { status: 500 });
    }
}
