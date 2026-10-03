export interface PendingPayment {
    id: string;
    youtuberId: string;
    youtuberName: string;
    amount: number;
    description: string;
}

export interface GroupedPendingPayment {
    youtuberKey: string;
    youtuberId: string;
    youtuberName: string;
    totalAmount: number;
    items: PendingPayment[];
}

export function groupPendingPayments(
    payments: PendingPayment[],
    youtubers: { id: string; name: string }[]
): GroupedPendingPayment[] {
    const youtuberNames = new Map(youtubers.map(youtuber => [youtuber.id, youtuber.name]));
    const groups = new Map<string, GroupedPendingPayment>();

    for (const payment of payments) {
        const key = payment.youtuberId || payment.youtuberName || 'unknown';
        if (!groups.has(key)) {
            groups.set(key, {
                youtuberKey: key,
                youtuberId: payment.youtuberId,
                youtuberName: youtuberNames.get(payment.youtuberId) || payment.youtuberName || 'Bilinmeyen YouTuber',
                totalAmount: 0,
                items: []
            });
        }
        const group = groups.get(key)!;
        group.totalAmount += payment.amount;
        group.items.push(payment);
    }

    return Array.from(groups.values()).sort((a, b) => {
        // Removed YouTubers have no current name; their ID still gives them a stable position.
        const aSortKey = youtuberNames.get(a.youtuberId) || a.youtuberKey;
        const bSortKey = youtuberNames.get(b.youtuberId) || b.youtuberKey;
        return aSortKey.localeCompare(bSortKey, 'tr', { sensitivity: 'base' }) ||
            a.youtuberKey.localeCompare(b.youtuberKey);
    });
}
