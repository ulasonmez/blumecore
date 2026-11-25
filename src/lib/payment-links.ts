// Gelir kayıtlarını (records, type: 'income') YouTuber video atamalarına (assignments) bağlar.
// Bir ödeme birden fazla atamayı kapsayabilir; her bağlantı tam veya kısmi ödeme olarak işaretlenir.

export type PaymentCoverage = 'full' | 'partial';

export interface PaidAssignmentLink {
    assignmentId: string;
    coverage: PaymentCoverage;
}

export type AssignmentPaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface PaymentRecordLike {
    id: string;
    type?: unknown;
    paidAssignments?: unknown;
}

export interface AssignmentPaymentSummary {
    status: AssignmentPaymentStatus;
    recordIds: string[];
}

/** Firestore'dan gelen değeri doğrular; geçersiz girdileri atar, aynı atamayı bir kez tutar (tam ödeme kısmiye üstün gelir). */
export function readPaidAssignments(value: unknown): PaidAssignmentLink[] {
    if (!Array.isArray(value)) return [];
    const byId = new Map<string, PaidAssignmentLink>();
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const { assignmentId, coverage } = item as { assignmentId?: unknown; coverage?: unknown };
        if (typeof assignmentId !== 'string' || !assignmentId.trim()) continue;
        const normalized: PaymentCoverage = coverage === 'partial' ? 'partial' : 'full';
        const existing = byId.get(assignmentId);
        if (!existing || (existing.coverage === 'partial' && normalized === 'full')) {
            byId.set(assignmentId, { assignmentId, coverage: normalized });
        }
    }
    return [...byId.values()];
}

/** Yalnızca verilen (ör. seçili YouTuber'a ait) atamalara ait bağlantıları bırakır. */
export function filterLinksToAssignments(links: PaidAssignmentLink[], assignmentIds: Iterable<string>): PaidAssignmentLink[] {
    const allowed = new Set(assignmentIds);
    return readPaidAssignments(links).filter(link => allowed.has(link.assignmentId));
}

/**
 * Her atamanın ödeme durumunu gelir kayıtlarından hesaplar.
 * Herhangi bir ödemede tam → ödendi; yalnızca kısmi bağlantılar → kısmi; hiç bağlantı yok → haritada yer almaz (ödenmedi).
 * `excludeRecordId`, düzenlenen kaydın kendi bağlantılarını diğer ödemelerden ayırmak içindir.
 */
export function buildAssignmentPaymentMap(
    records: PaymentRecordLike[],
    excludeRecordId?: string,
): Map<string, AssignmentPaymentSummary> {
    const map = new Map<string, AssignmentPaymentSummary>();
    for (const record of records) {
        if (record.type === 'expense') continue;
        if (excludeRecordId && record.id === excludeRecordId) continue;
        for (const link of readPaidAssignments(record.paidAssignments)) {
            const current = map.get(link.assignmentId) ?? { status: 'partial' as AssignmentPaymentStatus, recordIds: [] };
            if (link.coverage === 'full') current.status = 'paid';
            if (!current.recordIds.includes(record.id)) current.recordIds.push(record.id);
            map.set(link.assignmentId, current);
        }
    }
    return map;
}

export function getAssignmentPaymentStatus(map: Map<string, AssignmentPaymentSummary>, assignmentId: string): AssignmentPaymentStatus {
    return map.get(assignmentId)?.status ?? 'unpaid';
}

export const PAYMENT_STATUS_LABELS: Record<AssignmentPaymentStatus, string> = {
    paid: 'Ödendi',
    partial: 'Kısmi ödendi',
    unpaid: 'Ödenmedi',
};
