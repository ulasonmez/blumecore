import { normalizeCustomerVideoUrl } from './customer-video-url';

/**
 * Apps Script entegrasyonu için müşteri videosu eşleştirme kuralları.
 * Bu dosya Firebase'e bağımlı değildir; route'lar Firestore okuma/yazmasını yapar,
 * karar bu saf fonksiyonlarda verilir.
 */

export const DEFAULT_CUSTOMER_VIDEO_AUTO_THRESHOLD = 0.85;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Günlük tetikleyicinin saat kaymasıyla bir günü kaçırmaması için tolerans. */
const CHECK_TOLERANCE_MS = 3 * 60 * 60 * 1000;
export const MAX_CHECKED_BATCH = 200;

/**
 * Satıştan bu yana geçen süreye göre kontrol sıklığı.
 * Yeni satışlar sık, eski satışlar seyrek kontrol edilir; 1 yıldan eski satışlar
 * yalnızca hiç kontrol edilmemişse bir kez kontrol edilir.
 */
export const CUSTOMER_VIDEO_CHECK_SCHEDULE: ReadonlyArray<{ maxAgeDays: number; intervalDays: number }> = [
    { maxAgeDays: 30, intervalDays: 1 },
    { maxAgeDays: 90, intervalDays: 7 },
    { maxAgeDays: 365, intervalDays: 30 }
];
const MAX_TITLE_LENGTH = 300;
const MAX_REASON_LENGTH = 500;

export interface CustomerVideoSuggestion {
    url: string;
    videoId: string;
    title: string | null;
    confidence: number;
    reason: string | null;
    suggestedAt: number;
}

export interface CustomerVideoMatch {
    videoId: string;
    title: string | null;
    confidence: number;
    reason: string | null;
    matchedAt: number;
}

/** Atama belgesinde bu akışın okuduğu alanlar. */
export interface CustomerVideoAssignmentState {
    customerVideoUrl?: unknown;
    customerVideoSuggestion?: unknown;
    customerVideoRejectedIds?: unknown;
    customerVideoLastCheckedAt?: unknown;
}

export interface CustomerVideoSubmission {
    assignmentId: string;
    url: string;
    videoId: string;
    title: string | null;
    confidence: number;
    reason: string | null;
}

export type SubmissionParseResult =
    | { ok: true; submission: CustomerVideoSubmission }
    | { ok: false; error: string };

export type CustomerVideoOutcome =
    | 'AUTO_SET'
    | 'SUGGESTED'
    | 'ALREADY_SET'
    | 'DUPLICATE_SUGGESTION'
    | 'PREVIOUSLY_REJECTED';

export interface CustomerVideoDecision {
    outcome: CustomerVideoOutcome;
    /** Yazılacak alanlar; null ise belge değişmez. */
    set: Record<string, unknown> | null;
    /** Silinecek alan adları. */
    remove: string[];
}

/** YouTube video kimliğini çıkarır; aynı videonun farklı link biçimlerini eşitlemek için kullanılır. */
export function extractYoutubeVideoId(rawUrl: string): string | null {
    const normalized = normalizeCustomerVideoUrl(rawUrl);
    if (!normalized) return null;
    const url = new URL(normalized);
    let id: string | null = null;
    if (url.hostname.toLowerCase() === 'youtu.be') {
        id = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } else if (url.pathname === '/watch') {
        id = url.searchParams.get('v');
    } else {
        const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/);
        id = match ? match[1] : null;
    }
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

/** Saklanacak kanonik bağlantı; takip parametreleri ve zaman damgaları atılır. */
export function canonicalYoutubeUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

export function resolveAutoThreshold(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') return DEFAULT_CUSTOMER_VIDEO_AUTO_THRESHOLD;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value > 1) return DEFAULT_CUSTOMER_VIDEO_AUTO_THRESHOLD;
    return value;
}

function optionalText(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(/[\r\n\t]+/g, ' ').trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

export function parseCustomerVideoSubmission(body: unknown): SubmissionParseResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'İstek gövdesi JSON nesnesi olmalıdır.' };
    }
    const input = body as Record<string, unknown>;

    const assignmentId = typeof input.assignmentId === 'string' ? input.assignmentId.trim() : '';
    if (!assignmentId || assignmentId.length > 128 || assignmentId.includes('/')) {
        return { ok: false, error: 'Geçerli bir assignmentId gereklidir.' };
    }

    const rawUrl = typeof input.customerVideoUrl === 'string' ? input.customerVideoUrl : '';
    const videoId = extractYoutubeVideoId(rawUrl);
    if (!videoId) {
        return { ok: false, error: 'customerVideoUrl geçerli bir HTTPS YouTube video bağlantısı olmalıdır.' };
    }

    const confidence = input.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        return { ok: false, error: 'confidence 0 ile 1 arasında bir sayı olmalıdır.' };
    }

    return {
        ok: true,
        submission: {
            assignmentId,
            url: canonicalYoutubeUrl(videoId),
            videoId,
            title: optionalText(input.matchedTitle, MAX_TITLE_LENGTH),
            confidence,
            reason: optionalText(input.reason, MAX_REASON_LENGTH)
        }
    };
}

export function readRejectedIds(state: CustomerVideoAssignmentState): string[] {
    const value = state.customerVideoRejectedIds;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export function readSuggestion(state: CustomerVideoAssignmentState): CustomerVideoSuggestion | null {
    const value = state.customerVideoSuggestion;
    if (!value || typeof value !== 'object') return null;
    const s = value as Partial<CustomerVideoSuggestion>;
    if (typeof s.url !== 'string' || typeof s.videoId !== 'string' || typeof s.confidence !== 'number') return null;
    return {
        url: s.url,
        videoId: s.videoId,
        title: typeof s.title === 'string' ? s.title : null,
        confidence: s.confidence,
        reason: typeof s.reason === 'string' ? s.reason : null,
        suggestedAt: typeof s.suggestedAt === 'number' ? s.suggestedAt : 0
    };
}

export function hasCustomerVideoUrl(state: CustomerVideoAssignmentState): boolean {
    return typeof state.customerVideoUrl === 'string' && state.customerVideoUrl.trim() !== '';
}

/**
 * Kurallar:
 * 1. Atamada müşteri bağlantısı varsa (elle veya otomatik) asla üzerine yazılmaz.
 * 2. Sahibin daha önce reddettiği video tekrar önerilmez/yazılmaz.
 * 3. Güven eşik değerine eşit/üstündeyse bağlantı doğrudan yazılır, bekleyen öneri silinir.
 * 4. Eşiğin altındaysa öneri olarak kaydedilir. Aynı video zaten önerildiyse yalnızca daha
 *    yüksek güvenle güncellenir; farklı bir video ise daha yüksek güvenliyse eskisinin yerini alır.
 */
export function decideCustomerVideoUpdate(
    state: CustomerVideoAssignmentState,
    submission: CustomerVideoSubmission,
    threshold: number,
    now: number
): CustomerVideoDecision {
    if (hasCustomerVideoUrl(state)) {
        return { outcome: 'ALREADY_SET', set: null, remove: [] };
    }
    if (readRejectedIds(state).includes(submission.videoId)) {
        return { outcome: 'PREVIOUSLY_REJECTED', set: null, remove: [] };
    }

    if (submission.confidence >= threshold) {
        const match: CustomerVideoMatch = {
            videoId: submission.videoId,
            title: submission.title,
            confidence: submission.confidence,
            reason: submission.reason,
            matchedAt: now
        };
        return {
            outcome: 'AUTO_SET',
            set: {
                customerVideoUrl: submission.url,
                customerVideoSource: 'auto',
                customerVideoMatch: match
            },
            remove: ['customerVideoSuggestion']
        };
    }

    const existing = readSuggestion(state);
    if (existing && existing.confidence >= submission.confidence) {
        return { outcome: 'DUPLICATE_SUGGESTION', set: null, remove: [] };
    }

    const suggestion: CustomerVideoSuggestion = {
        url: submission.url,
        videoId: submission.videoId,
        title: submission.title,
        confidence: submission.confidence,
        reason: submission.reason,
        suggestedAt: now
    };
    return { outcome: 'SUGGESTED', set: { customerVideoSuggestion: suggestion }, remove: [] };
}

export interface CheckSchedule {
    due: boolean;
    /** null: bu atama artık periyodik olarak kontrol edilmez. */
    intervalDays: number | null;
}

/**
 * Atamanın bugün kontrol edilmesi gerekip gerekmediği.
 * Satış tarihi bilinmiyorsa aylık aralık uygulanır.
 */
export function getCheckSchedule(assignedAt: number | null, lastCheckedAt: number | null, now: number): CheckSchedule {
    let intervalDays: number | null = 30;
    if (assignedAt !== null) {
        const ageDays = Math.max(0, (now - assignedAt) / DAY_MS);
        const tier = CUSTOMER_VIDEO_CHECK_SCHEDULE.find(t => ageDays <= t.maxAgeDays);
        intervalDays = tier ? tier.intervalDays : null;
    }
    if (lastCheckedAt === null) return { due: true, intervalDays };
    if (intervalDays === null) return { due: false, intervalDays };
    return { due: now - lastCheckedAt >= intervalDays * DAY_MS - CHECK_TOLERANCE_MS, intervalDays };
}

export function parseCheckedAssignmentIds(body: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
    const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).assignmentIds : undefined;
    if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'assignmentIds boş olmayan bir dizi olmalıdır.' };
    if (raw.length > MAX_CHECKED_BATCH) return { ok: false, error: `Tek istekte en fazla ${MAX_CHECKED_BATCH} atama gönderilebilir.` };
    const ids = new Set<string>();
    for (const value of raw) {
        const id = typeof value === 'string' ? value.trim() : '';
        if (!id || id.length > 128 || id.includes('/')) return { ok: false, error: 'assignmentIds geçersiz kimlik içeriyor.' };
        ids.add(id);
    }
    return { ok: true, ids: [...ids] };
}

export interface PendingCustomerVideoItem {
    assignmentId: string;
    assignedAt: number | null;
    lastCheckedAt: number | null;
    checkIntervalDays: number | null;
    youtuber: { id: string; name: string; channelUrl: string | null };
    originalVideo: { id: string; title: string | null; url: string | null };
    pendingSuggestion: { url: string; videoId: string; title: string | null; confidence: number } | null;
    rejectedVideoIds: string[];
}

interface PendingSourceAssignment extends CustomerVideoAssignmentState {
    youtuberId?: unknown;
    videoId?: unknown;
    name?: unknown;
    createdAt?: unknown;
}

function toMillis(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    return null;
}

/** Bağlantısı eksik atamayı Apps Script'in iş listesi öğesine çevirir; bağlantısı olanlar için null döner. */
export function buildPendingItem(
    assignmentId: string,
    assignment: PendingSourceAssignment,
    youtuber: { name?: unknown; channelUrl?: unknown } | null,
    video: { title?: unknown; url?: unknown } | null,
    now: number = Date.now()
): PendingCustomerVideoItem | null {
    if (hasCustomerVideoUrl(assignment)) return null;
    const assignedAt = toMillis(assignment.createdAt);
    const lastCheckedAt = toMillis(assignment.customerVideoLastCheckedAt);
    const schedule = { ...getCheckSchedule(assignedAt, lastCheckedAt, now), lastCheckedAt };
    const youtuberId = typeof assignment.youtuberId === 'string' ? assignment.youtuberId : '';
    const videoId = typeof assignment.videoId === 'string' ? assignment.videoId : '';
    const suggestion = readSuggestion(assignment);
    const youtuberName = typeof youtuber?.name === 'string' ? youtuber.name
        : typeof assignment.name === 'string' ? assignment.name : '';
    const channelUrl = typeof youtuber?.channelUrl === 'string' && youtuber.channelUrl.trim() ? youtuber.channelUrl.trim() : null;

    return {
        assignmentId,
        assignedAt,
        lastCheckedAt: schedule.lastCheckedAt,
        checkIntervalDays: schedule.intervalDays,
        youtuber: { id: youtuberId, name: youtuberName, channelUrl },
        originalVideo: {
            id: videoId,
            title: typeof video?.title === 'string' ? video.title : null,
            url: typeof video?.url === 'string' ? video.url : null
        },
        pendingSuggestion: suggestion
            ? { url: suggestion.url, videoId: suggestion.videoId, title: suggestion.title, confidence: suggestion.confidence }
            : null,
        rejectedVideoIds: readRejectedIds(assignment)
    };
}

/** İş listesi: kontrol zamanı gelmiş öğeler ve sayılar. */
export function selectDueItems(items: PendingCustomerVideoItem[], now: number, includeAll: boolean): { items: PendingCustomerVideoItem[]; notDue: number } {
    if (includeAll) return { items, notDue: 0 };
    const due = items.filter(item => getCheckSchedule(item.assignedAt, item.lastCheckedAt, now).due);
    return { items: due, notDue: items.length - due.length };
}
