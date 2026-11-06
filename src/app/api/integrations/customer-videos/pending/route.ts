import { NextRequest, NextResponse } from 'next/server';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireCustomerVideoSyncSecret } from '@/lib/server-auth';
import { buildPendingItem, extractYoutubeVideoId, resolveAutoThreshold, selectDueItems, PendingCustomerVideoItem } from '@/lib/customer-video-sync';

export const dynamic = 'force-dynamic';

async function readDocs(refs: DocumentReference[]): Promise<Map<string, Record<string, unknown>>> {
    const result = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < refs.length; i += 300) {
        const chunk = refs.slice(i, i + 300);
        if (chunk.length === 0) continue;
        const snaps = await adminDb.getAll(...chunk);
        for (const snap of snaps) {
            if (snap.exists) result.set(snap.id, snap.data() as Record<string, unknown>);
        }
    }
    return result;
}

/**
 * Apps Script iş listesi: müşteri videosu bağlantısı boş olan ve kontrol zamanı gelmiş atamalar.
 * Salt okunurdur. `?all=1` takvimi yok sayar; `?youtuberId=` tek YouTuber'a daraltır.
 * `claimedVideoIdsByYoutuber`, aynı YouTuber'ın başka atamalarına zaten bağlanmış videoları listeler.
 */
export async function GET(request: NextRequest) {
    const auth = requireCustomerVideoSyncSecret(request);
    if (!auth.ok) return auth.response;

    const ownerUid = process.env.ADMIN_FIREBASE_UID;
    if (!ownerUid) {
        return NextResponse.json({ error: 'Sunucu yapılandırması eksik: ADMIN_FIREBASE_UID.' }, { status: 503 });
    }

    try {
        const params = request.nextUrl.searchParams;
        const youtuberFilter = params.get('youtuberId')?.trim() || null;
        const includeAll = params.get('all') === '1';
        const now = Date.now();
        let query = adminDb.collection('assignments').where('userId', '==', ownerUid);
        if (youtuberFilter) query = query.where('youtuberId', '==', youtuberFilter);
        const assignmentsSnap = await query.get();

        const youtuberIds = new Set<string>();
        const videoIds = new Set<string>();
        const claimed = new Map<string, Set<string>>();
        for (const doc of assignmentsSnap.docs) {
            const data = doc.data();
            if (typeof data.customerVideoUrl === 'string' && data.customerVideoUrl.trim()) {
                const claimedId = extractYoutubeVideoId(data.customerVideoUrl);
                if (claimedId && typeof data.youtuberId === 'string') {
                    if (!claimed.has(data.youtuberId)) claimed.set(data.youtuberId, new Set());
                    claimed.get(data.youtuberId)!.add(claimedId);
                }
                continue;
            }
            if (typeof data.youtuberId === 'string' && data.youtuberId) youtuberIds.add(data.youtuberId);
            if (typeof data.videoId === 'string' && data.videoId) videoIds.add(data.videoId);
        }

        const [youtubers, videos] = await Promise.all([
            readDocs([...youtuberIds].map(id => adminDb.collection('youtubers').doc(id))),
            readDocs([...videoIds].map(id => adminDb.collection('youtube_videos').doc(id)))
        ]);

        const items: PendingCustomerVideoItem[] = [];
        for (const doc of assignmentsSnap.docs) {
            const data = doc.data();
            const item = buildPendingItem(
                doc.id,
                data,
                typeof data.youtuberId === 'string' ? youtubers.get(data.youtuberId) ?? null : null,
                typeof data.videoId === 'string' ? videos.get(data.videoId) ?? null : null,
                now
            );
            if (item) items.push(item);
        }
        const selected = selectDueItems(items, now, includeAll);
        selected.items.sort((a, b) => (b.assignedAt ?? 0) - (a.assignedAt ?? 0));

        const claimedVideoIdsByYoutuber: Record<string, string[]> = {};
        for (const item of selected.items) {
            const ids = claimed.get(item.youtuber.id);
            if (ids) claimedVideoIdsByYoutuber[item.youtuber.id] = [...ids];
        }

        return NextResponse.json({
            items: selected.items,
            count: selected.items.length,
            notDueCount: selected.notDue,
            claimedVideoIdsByYoutuber,
            autoThreshold: resolveAutoThreshold(process.env.CUSTOMER_VIDEO_AUTO_THRESHOLD),
            generatedAt: new Date().toISOString()
        });
    } catch (err: unknown) {
        console.error('Error in GET /api/integrations/customer-videos/pending:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'İş listesi oluşturulamadı.' }, { status: 500 });
    }
}
