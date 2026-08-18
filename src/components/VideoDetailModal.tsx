'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink, Calendar, Users, Handshake, FileText, Video as VideoIcon } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './VideoDetailModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface YoutuberAssignment {
    id: string;
    youtuberId: string;
    name: string;
    delivered?: boolean;
    note: string;
    videoId: string;
    createdAt?: number;
    brokerId?: string;
}

interface VideoDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    video: {
        id: string;
        url: string;
        title: string;
    };
    assignments: YoutuberAssignment[];
}

export default function VideoDetailModal({
    isOpen,
    onClose,
    video,
    assignments
}: VideoDetailModalProps) {
    const { user } = useAuth();
    const [brokers, setBrokers] = useState<Record<string, string>>({});

    // Fetch Brokers to show broker names if assigned
    useEffect(() => {
        if (!isOpen || !user) return;
        const qBrokers = query(
            collection(db, "team"),
            where("userId", "==", user.uid),
            where("role", "==", "broker")
        );
        const unsub = onSnapshot(qBrokers, (snapshot) => {
            const map: Record<string, string> = {};
            snapshot.forEach(doc => {
                map[doc.id] = doc.data().name;
            });
            setBrokers(map);
        });
        return () => unsub();
    }, [isOpen, user]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.topRow}>
                        <span className={styles.badgeTag}>
                            <VideoIcon size={12} />
                            Video Detayı
                        </span>
                        <button
                            className={styles.closeBtn}
                            onClick={onClose}
                            aria-label="Kapat"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <h2 className={styles.videoTitle}>{video.title}</h2>

                    <div className={styles.actionRow}>
                        <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.youtubeBtn}
                        >
                            <ExternalLink size={14} />
                            <span>YouTube&apos;da Aç</span>
                        </a>
                    </div>
                </div>

                {/* Content */}
                <div className={styles.contentBody}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Atanan YouTuberlar</span>
                        <span className={styles.countBadge}>
                            {assignments.length} Kayıt
                        </span>
                    </div>

                    {assignments.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Users size={28} className={styles.emptyIcon} />
                            <p>Bu video için henüz bir YouTuber kaydı bulunmuyor.</p>
                        </div>
                    ) : (
                        <div className={styles.assignmentList}>
                            {assignments.map((a) => {
                                const initial = a.name ? a.name.charAt(0).toUpperCase() : '?';
                                const brokerName = a.brokerId ? brokers[a.brokerId] : null;

                                return (
                                    <div key={a.id} className={styles.assignmentCard}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.youtuberProfile}>
                                                <div className={styles.avatar}>{initial}</div>
                                                <span className={styles.youtuberName}>{a.name}</span>
                                            </div>

                                            {a.createdAt && (
                                                <div className={styles.dateBadge}>
                                                    <Calendar size={13} />
                                                    <span>
                                                        {format(new Date(a.createdAt), 'd MMM yyyy', { locale: tr })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {brokerName && (
                                            <div className={styles.metaRow}>
                                                <span className={styles.brokerTag}>
                                                    <Handshake size={12} />
                                                    Aracı: {brokerName}
                                                </span>
                                            </div>
                                        )}

                                        {a.note ? (
                                            <div className={styles.noteContainer}>
                                                <FileText size={14} className={styles.noteIcon} />
                                                <span className={styles.noteText}>{a.note}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
