'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, User, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import modalStyles from '@/components/CalendarModal.module.css';
import groupStyles from '@/components/PendingPaymentsModal.module.css';
import styles from '@/components/UnpaidVideosModal.module.css';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import {
    buildUnpaidVideoGroups,
    type UnpaidAssignmentInput,
    type UnpaidRecordInput,
} from '@/lib/unpaid-videos';

interface UnpaidVideosModalProps {
    isOpen: boolean;
    onClose: () => void;
    youtubers: { id: string; name: string }[];
    onOpenYoutuber: (youtuberId: string) => void;
}

/**
 * Otomatik beklenen ödemeler: "Ödenmedi" durumundaki video atamalarını YouTuber bazında listeler.
 * Salt okunurdur; bir video ödendi sayılsın diye ödeme kaydı YouTuber detayındaki Para sekmesinden bağlanır.
 */
export default function UnpaidVideosModal({ isOpen, onClose, youtubers, onOpenYoutuber }: UnpaidVideosModalProps) {
    const { user } = useAuth();
    const [assignments, setAssignments] = useState<UnpaidAssignmentInput[] | null>(null);
    const [records, setRecords] = useState<UnpaidRecordInput[] | null>(null);
    const [videos, setVideos] = useState<{ id: string; title?: unknown }[] | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!isOpen || !user) return;
        const onError = (error: Error) => {
            console.error('Error loading unpaid videos:', error);
            setLoadError('Veriler yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
        };

        const unsubAssignments = onSnapshot(
            query(collection(db, 'assignments'), where('userId', '==', user.uid)),
            snapshot => setAssignments(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
            onError,
        );
        const unsubRecords = onSnapshot(
            query(collection(db, 'records'), where('userId', '==', user.uid)),
            snapshot => setRecords(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
            onError,
        );
        const unsubVideos = onSnapshot(
            query(collection(db, 'youtube_videos'), where('userId', '==', user.uid)),
            snapshot => setVideos(snapshot.docs.map(d => ({ id: d.id, title: d.data().title }))),
            onError,
        );
        return () => { unsubAssignments(); unsubRecords(); unsubVideos(); };
    }, [isOpen, user]);

    const groups = useMemo(
        () => (assignments && records && videos ? buildUnpaidVideoGroups(assignments, records, videos, youtubers) : []),
        [assignments, records, videos, youtubers],
    );
    const isLoading = !assignments || !records || !videos;
    const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0);

    if (!isOpen) return null;

    const toggleGroup = (key: string) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

    return (
        <div className={modalStyles.overlay} onClick={onClose} style={{ zIndex: 101 }}>
            <div className={`${modalStyles.modal} ${styles.modal}`} onClick={event => event.stopPropagation()}>
                <div className={modalStyles.header} style={{ flexShrink: 0, marginBottom: '12px' }}>
                    <div>
                        <h2 className={modalStyles.title}>Beklenen Ödemeler</h2>
                        <span className={styles.subtitle}>
                            {isLoading ? 'Yükleniyor…' : `${totalCount} ödenmemiş video · ${groups.length} YouTuber`}
                        </span>
                    </div>
                    <button className={modalStyles.closeBtn} onClick={onClose} aria-label="Kapat">
                        <X size={24} />
                    </button>
                </div>

                <p className={styles.hint}>
                    Otomatik liste: Videolar sekmesinde “Ödenmedi” görünen atamalar. Bir ödeme kaydına tam olarak bağlanan video listeden kalkar; kısmi ödenenler gösterilmez.
                </p>

                {loadError && <div role="alert" className={styles.error}>{loadError}</div>}

                <div className={styles.list}>
                    {!isLoading && groups.length === 0 && !loadError && (
                        <div className={styles.empty}>Ödenmemiş video yok.</div>
                    )}

                    {groups.map(group => {
                        const isExpanded = !collapsedGroups[group.youtuberKey];
                        const canOpen = youtubers.some(y => y.id === group.youtuberId);
                        return (
                            <div key={group.youtuberKey} className={styles.groupCard}>
                                <div className={`${groupStyles.groupHeader} ${isExpanded ? groupStyles.groupHeaderExpanded : ''}`}>
                                    <button
                                        type="button"
                                        className={groupStyles.groupNameButton}
                                        onClick={() => toggleGroup(group.youtuberKey)}
                                        aria-expanded={isExpanded}
                                        aria-label={`${group.youtuberName} ödenmemiş videolarını ${isExpanded ? 'gizle' : 'göster'}`}
                                    >
                                        <User size={15} className={groupStyles.groupUserIcon} />
                                        <span className={groupStyles.groupName}>{group.youtuberName}</span>
                                    </button>
                                    <div className={groupStyles.groupActions}>
                                        {canOpen && (
                                            <button
                                                type="button"
                                                className={styles.openButton}
                                                onClick={() => onOpenYoutuber(group.youtuberId)}
                                                title={`${group.youtuberName} detayını aç`}
                                                aria-label={`${group.youtuberName} detayını aç`}
                                            >
                                                <ExternalLink size={16} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={groupStyles.expandButton}
                                            onClick={() => toggleGroup(group.youtuberKey)}
                                            aria-expanded={isExpanded}
                                            aria-label={`${group.youtuberName} ödenmemiş videolarını ${isExpanded ? 'gizle' : 'göster'}`}
                                        >
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                    </div>
                                    <div className={groupStyles.groupSummary}>
                                        <span className={groupStyles.paymentCount}>{group.items.length} video</span>
                                        <span className={styles.unpaidBadge}>Ödenmedi</span>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div>
                                        {group.items.map((item, index) => (
                                            <div
                                                key={item.assignmentId}
                                                className={styles.item}
                                                style={{
                                                    borderTop: index > 0 ? '1px solid var(--border-color)' : 'none',
                                                    backgroundColor: index % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
                                                }}
                                            >
                                                <div className={styles.itemTitle}>{item.videoTitle}</div>
                                                <div className={styles.itemMeta}>
                                                    {item.createdAt !== null && (
                                                        <span>{format(new Date(item.createdAt), 'd MMM yyyy', { locale: tr })}</span>
                                                    )}
                                                    {item.note && <span className={styles.itemNote}>{item.note}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
