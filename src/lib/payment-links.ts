// Gelir kayıtlarını (records, type: 'income') katalog videolarına (youtube_videos) bağlar.
// Bir ödeme birden fazla videoyu kapsayabilir; her bağlantı tam veya kısmi ödeme olarak işaretlenir.
// Durum, ödemenin YouTuber'ı ile videoya göre hesaplanır; aynı YouTuber'ın o videoya ait atamaları bu durumu gösterir.

export type PaymentCoverage = 'full' | 'partial';

export interface PaidVideoLink {
    videoId: string;
    coverage: PaymentCoverage;
}

/** Eski biçim (kısa süre kullanıldı): atama kimliğiyle bağlantı. Okunur, yeni kayıtta `paidVideos`'a çevrilir. */
export interface LegacyPaidAssignmentLink {
    assignmentId: string;
    coverage: PaymentCoverage;
}

export type VideoPaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface PaymentRecordLike {
    id: string;
    type?: unknown;
    paidVideos?: unknown;
    paidAssignments?: unknown;
}

export interface VideoPaymentSummary {
    status: VideoPaymentStatus;
    recordIds: string[];
}

function readLinks<K extends string>(value: unknown, key: K): Array<Record<K, string> & { coverage: PaymentCoverage }> {
    if (!Array.isArray(value)) return [];
    const byId = new Map<string, PaymentCoverage>();
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const id = (item as Record<string, unknown>)[key];
        if (typeof id !== 'string' || !id.trim()) continue;
        const coverage: PaymentCoverage = (item as { coverage?: unknown }).coverage === 'partial' ? 'partial' : 'full';
        const existing = byId.get(id);
        if (!existing || (existing === 'partial' && coverage === 'full')) byId.set(id, coverage);
    }
    return [...byId].map(([id, coverage]) => ({ [key]: id, coverage }) as Record<K, string> & { coverage: PaymentCoverage });
}

/** Firestore'dan gelen `paidVideos` değerini doğrular; geçersizleri atar, tekrarları birleştirir (tam kısmiye üstün gelir). */
export function readPaidVideos(value: unknown): PaidVideoLink[] {
    return readLinks(value, 'videoId');
}

export function readLegacyPaidAssignments(value: unknown): LegacyPaidAssignmentLink[] {
    return readLinks(value, 'assignmentId');
}

/** Tekrarları birleştirerek bağlantı listelerini birleştirir. */
export function mergePaidVideos(...lists: PaidVideoLink[][]): PaidVideoLink[] {
    return readPaidVideos(lists.flat());
}

/** Eski atama bağlantılarını, atama → video eşlemesiyle video bağlantısına çevirir; çözülemeyenleri atar. */
export function convertLegacyLinks(legacy: LegacyPaidAssignmentLink[], assignmentToVideo: Map<string, string>): PaidVideoLink[] {
    const converted: PaidVideoLink[] = [];
    for (const link of legacy) {
        const videoId = assignmentToVideo.get(link.assignmentId);
        if (videoId) converted.push({ videoId, coverage: link.coverage });
    }
    return readPaidVideos(converted);
}

/** Bir kaydın etkin video bağlantıları: `paidVideos` + çevrilebilen eski `paidAssignments`. */
export function resolveRecordPaidVideos(record: PaymentRecordLike, assignmentToVideo: Map<string, string>): PaidVideoLink[] {
    return mergePaidVideos(
        readPaidVideos(record.paidVideos),
        convertLegacyLinks(readLegacyPaidAssignments(record.paidAssignments), assignmentToVideo),
    );
}

/**
 * Videoların ödeme durumunu gelir kayıtlarından hesaplar (kayıtlar aynı YouTuber'a ait olmalıdır).
 * Herhangi bir ödemede tam → ödendi; yalnızca kısmi → kısmi; hiç bağlantı yok → haritada yok (ödenmedi).
 * `excludeRecordId`, düzenlenen kaydın kendi bağlantılarını diğer ödemelerden ayırmak içindir.
 */
export function buildVideoPaymentMap(
    records: PaymentRecordLike[],
    assignmentToVideo: Map<string, string> = new Map(),
    excludeRecordId?: string,
): Map<string, VideoPaymentSummary> {
    const map = new Map<string, VideoPaymentSummary>();
    for (const record of records) {
        if (record.type === 'expense') continue;
        if (excludeRecordId && record.id === excludeRecordId) continue;
        for (const link of resolveRecordPaidVideos(record, assignmentToVideo)) {
            const current = map.get(link.videoId) ?? { status: 'partial' as VideoPaymentStatus, recordIds: [] };
            if (link.coverage === 'full') current.status = 'paid';
            if (!current.recordIds.includes(record.id)) current.recordIds.push(record.id);
            map.set(link.videoId, current);
        }
    }
    return map;
}

export function getVideoPaymentStatus(map: Map<string, VideoPaymentSummary>, videoId: string): VideoPaymentStatus {
    return map.get(videoId)?.status ?? 'unpaid';
}

/**
 * Birden fazla YouTuber'ın kayıtlarından YouTuber bazında ödeme haritaları kurar.
 * Durum her YouTuber için `buildVideoPaymentMap` ile ayrı hesaplanır (bir ödeme yalnızca kendi YouTuber'ının atamalarını öder).
 */
export function buildPaymentMapsByYoutuber(
    records: Array<PaymentRecordLike & { youtuberId?: unknown }>,
    assignmentToVideo: Map<string, string> = new Map(),
): Map<string, Map<string, VideoPaymentSummary>> {
    const byYoutuber = new Map<string, PaymentRecordLike[]>();
    for (const record of records) {
        if (typeof record.youtuberId !== 'string' || !record.youtuberId) continue;
        const list = byYoutuber.get(record.youtuberId) ?? [];
        list.push(record);
        byYoutuber.set(record.youtuberId, list);
    }
    const maps = new Map<string, Map<string, VideoPaymentSummary>>();
    for (const [youtuberId, list] of byYoutuber) maps.set(youtuberId, buildVideoPaymentMap(list, assignmentToVideo));
    return maps;
}

/** Bir YouTuber + video ikilisinin durumu; YouTuber'ın hiç ödemesi yoksa ödenmedi. */
export function getYoutuberVideoPaymentStatus(
    maps: Map<string, Map<string, VideoPaymentSummary>>,
    youtuberId: unknown,
    videoId: string,
): VideoPaymentStatus {
    if (typeof youtuberId !== 'string') return 'unpaid';
    const map = maps.get(youtuberId);
    return map ? getVideoPaymentStatus(map, videoId) : 'unpaid';
}

/** Arama için Türkçe duyarlı, küçük harfe çevrilmiş karşılaştırma. */
export function matchesVideoSearch(title: string, term: string): boolean {
    const needle = term.trim().toLocaleLowerCase('tr');
    if (!needle) return true;
    return title.toLocaleLowerCase('tr').includes(needle);
}

export const PAYMENT_STATUS_LABELS: Record<VideoPaymentStatus, string> = {
    paid: 'Ödendi',
    partial: 'Kısmi ödendi',
    unpaid: 'Ödenmedi',
};
