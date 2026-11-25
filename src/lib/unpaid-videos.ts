// YouTubers sayfasındaki otomatik "Beklenen Ödemeler" listesi.
// Her YouTuber'ın video atamalarını, ödeme durumu YouTuber detayındaki Videolar sekmesiyle aynı
// (`buildVideoPaymentMap`) kuralla hesaplanarak yalnızca "Ödenmedi" olanlarıyla gruplar.
// Kısmi ödenenler ve katalogda olmayan videolar listeye girmez.

import { buildVideoPaymentMap, getVideoPaymentStatus, type PaymentRecordLike } from './payment-links';

export interface UnpaidAssignmentInput {
    id: string;
    youtuberId?: unknown;
    videoId?: unknown;
    name?: unknown;
    note?: unknown;
    source?: unknown;
    createdAt?: unknown;
}

export interface UnpaidRecordInput extends PaymentRecordLike {
    youtuberId?: unknown;
}

export interface UnpaidVideoItem {
    assignmentId: string;
    videoId: string;
    videoTitle: string;
    note: string;
    createdAt: number | null;
}

export interface UnpaidVideoGroup {
    youtuberKey: string;
    youtuberId: string;
    youtuberName: string;
    items: UnpaidVideoItem[];
}

function asText(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function buildUnpaidVideoGroups(
    assignments: UnpaidAssignmentInput[],
    records: UnpaidRecordInput[],
    videos: { id: string; title?: unknown }[],
    youtubers: { id: string; name: string }[],
): UnpaidVideoGroup[] {
    const videoTitles = new Map(videos.map(video => [video.id, asText(video.title) || 'İsimsiz Video']));
    const youtuberNames = new Map(youtubers.map(youtuber => [youtuber.id, youtuber.name]));

    // YouTuber detayındaki Videolar sekmesiyle aynı kapsam: mod kaynaklı ve videosuz atamalar sayılmaz.
    const validAssignments = assignments.filter(assignment =>
        assignment.source !== 'mods' &&
        typeof assignment.videoId === 'string' && videoTitles.has(assignment.videoId) &&
        typeof assignment.youtuberId === 'string' && assignment.youtuberId !== ''
    );
    const assignmentToVideo = new Map(validAssignments.map(a => [a.id, a.videoId as string]));

    const recordsByYoutuber = new Map<string, UnpaidRecordInput[]>();
    for (const record of records) {
        if (typeof record.youtuberId !== 'string' || !record.youtuberId) continue;
        const list = recordsByYoutuber.get(record.youtuberId) ?? [];
        list.push(record);
        recordsByYoutuber.set(record.youtuberId, list);
    }

    const paymentMaps = new Map<string, ReturnType<typeof buildVideoPaymentMap>>();
    const groups = new Map<string, UnpaidVideoGroup>();

    for (const assignment of validAssignments) {
        const youtuberId = assignment.youtuberId as string;
        const videoId = assignment.videoId as string;
        let paymentMap = paymentMaps.get(youtuberId);
        if (!paymentMap) {
            paymentMap = buildVideoPaymentMap(recordsByYoutuber.get(youtuberId) ?? [], assignmentToVideo);
            paymentMaps.set(youtuberId, paymentMap);
        }
        if (getVideoPaymentStatus(paymentMap, videoId) !== 'unpaid') continue;

        if (!groups.has(youtuberId)) {
            groups.set(youtuberId, {
                youtuberKey: youtuberId,
                youtuberId,
                youtuberName: youtuberNames.get(youtuberId) || asText(assignment.name) || 'Bilinmeyen YouTuber',
                items: [],
            });
        }
        groups.get(youtuberId)!.items.push({
            assignmentId: assignment.id,
            videoId,
            videoTitle: videoTitles.get(videoId)!,
            note: asText(assignment.note).trim(),
            createdAt: typeof assignment.createdAt === 'number' && Number.isFinite(assignment.createdAt) ? assignment.createdAt : null,
        });
    }

    for (const group of groups.values()) {
        group.items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.assignmentId.localeCompare(b.assignmentId));
    }

    // Manuel beklenen ödemelerle aynı sıra: Türkçe alfabetik isim, eşitlikte kimlik.
    return Array.from(groups.values()).sort((a, b) =>
        a.youtuberName.localeCompare(b.youtuberName, 'tr', { sensitivity: 'base' }) ||
        a.youtuberKey.localeCompare(b.youtuberKey)
    );
}
