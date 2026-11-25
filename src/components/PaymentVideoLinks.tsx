'use client';

import { useState } from 'react';
import { CheckCircle2, CircleDashed, Search, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './PaymentVideoLinks.module.css';
import {
    PAYMENT_STATUS_LABELS,
    getVideoPaymentStatus,
    matchesVideoSearch,
    type PaidVideoLink,
    type PaymentCoverage,
    type VideoPaymentStatus,
    type VideoPaymentSummary,
} from '@/lib/payment-links';

export function PaymentStatusBadge({ status, compact = false }: { status: VideoPaymentStatus; compact?: boolean }) {
    const Icon = status === 'paid' ? CheckCircle2 : status === 'partial' ? CircleDashed : XCircle;
    return (
        <span className={`${styles.badge} ${styles[status]}`} title={PAYMENT_STATUS_LABELS[status]}>
            <Icon size={compact ? 13 : 14} aria-hidden="true" />
            {compact ? <span className={styles.srOnly}>{PAYMENT_STATUS_LABELS[status]}</span> : PAYMENT_STATUS_LABELS[status]}
        </span>
    );
}

export interface PayableVideo {
    id: string;
    title: string;
    /** Bu YouTuber'a atandığı tarih; atanmamışsa yok. */
    assignedAt?: number | null;
}

interface PaymentVideoPickerProps {
    /** Katalogdaki tüm videolar; YouTuber'a atananlar önce gelecek şekilde sıralı verilir. */
    videos: PayableVideo[];
    /** Bu kayıt dışındaki ödemelerden gelen durum (video kimliğine göre). */
    otherPayments: Map<string, VideoPaymentSummary>;
    value: PaidVideoLink[];
    onChange: (links: PaidVideoLink[]) => void;
    disabled?: boolean;
}

export default function PaymentVideoPicker({ videos, otherPayments, value, onChange, disabled }: PaymentVideoPickerProps) {
    const [search, setSearch] = useState('');
    const selected = new Map(value.map(link => [link.videoId, link.coverage]));
    const visible = videos.filter(video => matchesVideoSearch(video.title, search));

    const toggle = (videoId: string) => {
        if (selected.has(videoId)) {
            onChange(value.filter(link => link.videoId !== videoId));
        } else {
            onChange([...value, { videoId, coverage: 'full' }]);
        }
    };

    const setCoverage = (videoId: string, coverage: PaymentCoverage) => {
        onChange(value.map(link => link.videoId === videoId ? { ...link, coverage } : link));
    };

    const selectedTitles = value
        .map(link => videos.find(video => video.id === link.videoId))
        .filter((video): video is PayableVideo => Boolean(video));

    return (
        <div className={styles.picker}>
            <div className={styles.searchBox}>
                <Search size={16} aria-hidden="true" />
                <input
                    type="text"
                    placeholder="Video ara..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={disabled}
                    aria-label="Video ara"
                />
            </div>

            {selectedTitles.length > 0 && (
                <div className={styles.selectedSummary}>
                    {selectedTitles.length} video seçildi: {selectedTitles.map(video => video.title).join(', ')}
                </div>
            )}

            {videos.length === 0 ? (
                <p className={styles.empty}>Katalogda video yok.</p>
            ) : visible.length === 0 ? (
                <p className={styles.empty}>Aramanıza uygun video bulunamadı.</p>
            ) : (
                <div className={styles.list}>
                    {visible.map(video => {
                        const coverage = selected.get(video.id);
                        const otherStatus = getVideoPaymentStatus(otherPayments, video.id);
                        return (
                            <div key={video.id} className={`${styles.row} ${coverage ? styles.rowSelected : ''}`}>
                                <label className={styles.rowMain}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(coverage)}
                                        onChange={() => toggle(video.id)}
                                        disabled={disabled}
                                    />
                                    <span className={styles.rowText}>
                                        <span className={styles.rowTitle}>{video.title}</span>
                                        {(video.assignedAt !== undefined || otherStatus !== 'unpaid') && (
                                            <span className={styles.rowMeta}>
                                                {video.assignedAt !== undefined && (
                                                    <>Atandı{video.assignedAt ? ` · ${format(new Date(video.assignedAt), 'd MMM yyyy', { locale: tr })}` : ''}</>
                                                )}
                                                {video.assignedAt !== undefined && otherStatus !== 'unpaid' && ' · '}
                                                {otherStatus !== 'unpaid' && (
                                                    <>başka ödemede: <PaymentStatusBadge status={otherStatus} /></>
                                                )}
                                            </span>
                                        )}
                                    </span>
                                </label>
                                {coverage && (
                                    <div className={styles.coverage} role="group" aria-label="Ödeme kapsamı">
                                        <button
                                            type="button"
                                            className={coverage === 'full' ? styles.coverageFullActive : ''}
                                            onClick={() => setCoverage(video.id, 'full')}
                                            disabled={disabled}
                                        >
                                            Tam
                                        </button>
                                        <button
                                            type="button"
                                            className={coverage === 'partial' ? styles.coveragePartialActive : ''}
                                            onClick={() => setCoverage(video.id, 'partial')}
                                            disabled={disabled}
                                        >
                                            Kısmi
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
