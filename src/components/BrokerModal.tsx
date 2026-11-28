'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css'; // Reusing CalendarModal styles
import customerVideoStyles from './CustomerVideoLink.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { normalizeCustomerVideoUrl } from '@/lib/customer-video-url';
import { PaymentStatusBadge } from './PaymentVideoLinks';
import {
    buildPaymentMapsByYoutuber,
    getYoutuberVideoPaymentStatus,
    resolveRecordPaidVideos,
} from '@/lib/payment-links';

interface BrokerModalProps {
    isOpen: boolean;
    onClose: () => void;
    brokerId: string;
    brokerName: string;
}

interface RecordData {
    id: string;
    type?: 'income' | 'expense';
    amount: number;
    description?: string;
    date: Date;
    videoId?: string;
    youtuberId?: string;
    brokerId?: string;
    paidVideos?: unknown;
    paidAssignments?: unknown;
}

interface AssignmentData {
    id: string;
    videoId: string;
    youtuberId: string;
    name: string;
    delivered: boolean;
    note: string;
    createdAt?: number;
    source?: string;
    brokerId?: string;
    customerVideoUrl?: string;
}

interface VideoData {
    id: string;
    title: string;
}

export default function BrokerModal({
    isOpen,
    onClose,
    brokerId,
    brokerName
}: BrokerModalProps) {
    const { user } = useAuth();
    // Ödeme durumu, ödemede aracı seçilmemiş olsa da doğru hesaplansın diye sahibin tüm kayıtları/atamaları dinlenir;
    // aracıya ait olanlar aşağıda brokerId ile süzülür.
    const [allRecords, setAllRecords] = useState<RecordData[]>([]);
    const [allAssignments, setAllAssignments] = useState<AssignmentData[]>([]);
    const [videos, setVideos] = useState<VideoData[]>([]);
    const [youtubers, setYoutubers] = useState<{ id: string; name: string }[]>([]);
    const [activeTab, setActiveTab] = useState<'money' | 'videos'>('money');

    useEffect(() => {
        if (!isOpen || !user || !brokerId) return;

        const qRecords = query(collection(db, "records"), where("userId", "==", user.uid));

        const unsubRecords = onSnapshot(qRecords, (snapshot) => {
            const data: RecordData[] = [];
            snapshot.forEach(doc => {
                const rec = doc.data();
                if (rec.date && typeof rec.date.toDate === 'function') {
                    data.push({
                        id: doc.id,
                        type: rec.type === 'expense' ? 'expense' : 'income',
                        amount: Number(rec.amount) || 0,
                        description: rec.description || '',
                        date: rec.date.toDate(),
                        videoId: rec.videoId,
                        youtuberId: rec.youtuberId,
                        brokerId: rec.brokerId || undefined,
                        paidVideos: rec.paidVideos,
                        paidAssignments: rec.paidAssignments,
                    });
                }
            });
            // Newest to Oldest -> descending
            data.sort((a, b) => b.date.getTime() - a.date.getTime());
            setAllRecords(data);
        });

        const qAssignments = query(collection(db, "assignments"), where("userId", "==", user.uid));

        const unsubAssignments = onSnapshot(qAssignments, (snapshot) => {
            const data: AssignmentData[] = [];
            snapshot.forEach(doc => {
                const docData = doc.data();
                data.push({ id: doc.id, ...docData } as AssignmentData);
            });
            data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setAllAssignments(data);
        });

        // Fetch Videos
        const qVideos = query(collection(db, "youtube_videos"), where("userId", "==", user.uid));
        const unsubVideos = onSnapshot(qVideos, (snapshot) => {
            const vids: VideoData[] = [];
            snapshot.forEach(doc => {
                vids.push({ id: doc.id, ...doc.data() } as VideoData);
            });
            setVideos(vids);
        });

        const qYoutubers = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsubYoutubers = onSnapshot(qYoutubers, (snapshot) => {
            setYoutubers(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
        });

        return () => { unsubRecords(); unsubAssignments(); unsubVideos(); unsubYoutubers(); };
    }, [isOpen, user, brokerId]);

    if (!isOpen) return null;

    const records = allRecords.filter(r => r.brokerId === brokerId);
    const assignments = allAssignments.filter(a => a.brokerId === brokerId);
    const allTimeTotal = records.reduce((sum, r) => sum + r.amount, 0);
    // YouTuber detayındaki Videolar sekmesiyle aynı kural: durum, YouTuber'ın tüm gelir kayıtlarından hesaplanır.
    const assignmentToVideo = new Map(allAssignments.filter(a => a.videoId).map(a => [a.id, a.videoId]));
    const paymentMaps = buildPaymentMapsByYoutuber(allRecords, assignmentToVideo);
    const videoTitle = (videoId: string) => videos.find(v => v.id === videoId)?.title || 'Bilinmeyen Video';
    // Rozet yalnızca katalogda olan, mod kaynaklı olmayan video atamalarında gösterilir (ödemeye yalnızca bunlar bağlanabilir).
    const paymentStatusOf = (assignment: AssignmentData) =>
        assignment.source !== 'mods' && videos.some(v => v.id === assignment.videoId)
            ? getYoutuberVideoPaymentStatus(paymentMaps, assignment.youtuberId, assignment.videoId)
            : null;
    const statusCounts = assignments.reduce(
        (acc, a) => { const status = paymentStatusOf(a); if (status) acc[status] += 1; return acc; },
        { paid: 0, partial: 0, unpaid: 0 }
    );
    const hasPaymentStatus = statusCounts.paid + statusCounts.partial + statusCounts.unpaid > 0;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title} style={{ marginBottom: '4px' }}>{brokerName}</h2>
                        <span style={{ fontSize: '12px', color: 'var(--accent-blue)' }}>Aracı Bilgileri</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} style={{ alignSelf: 'flex-start' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.statsRow} style={{ gridTemplateColumns: '1fr', marginBottom: '16px' }}>
                    <div className={styles.statCard}>
                        <div className={styles.statValue}>${allTimeTotal}</div>
                        <div className={styles.statLabel}>Toplam Ciro (Aracı Olunan)</div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <button
                        onClick={() => setActiveTab('money')}
                        style={{
                            padding: '8px 16px',
                            background: activeTab === 'money' ? 'var(--action-green)' : 'transparent',
                            color: activeTab === 'money' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            flex: 1
                        }}
                    >
                        Para
                    </button>
                    <button
                        onClick={() => setActiveTab('videos')}
                        style={{
                            padding: '8px 16px',
                            background: activeTab === 'videos' ? 'var(--action-green)' : 'transparent',
                            color: activeTab === 'videos' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            flex: 1
                        }}
                    >
                        Videolar ({assignments.length})
                    </button>
                </div>

                {/* Tab Content */}
                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    {activeTab === 'money' && (
                        <>
                            {records.length === 0 ? (
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>Kayıt bulunmuyor.</p>
                            ) : (
                                records.map(record => (
                                    <div key={record.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                                {format(record.date, 'd MMMM yyyy', { locale: tr })}
                                            </span>
                                            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>${record.amount}</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                                            YouTuber: {youtubers.find(y => y.id === record.youtuberId)?.name || 'Bilinmeyen YouTuber'}
                                        </div>
                                        {record.description && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                {record.description}
                                            </div>
                                        )}
                                        {(() => {
                                            if (record.type === 'expense') return null;
                                            const links = resolveRecordPaidVideos(record, assignmentToVideo);
                                            if (links.length === 0) return null;
                                            return (
                                                <div className={styles.paymentLinks}>
                                                    {links.map(link => (
                                                        <div key={link.videoId} className={styles.paymentLinkRow}>
                                                            <PaymentStatusBadge status={link.coverage === 'full' ? 'paid' : 'partial'} compact />
                                                            <span>{videoTitle(link.videoId)}</span>
                                                            <span className={styles.paymentLinkCoverage}>{link.coverage === 'full' ? 'tam' : 'kısmi'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                        {record.videoId && (
                                            <div style={{ fontSize: '12px', color: 'var(--accent-blue)', marginTop: '4px' }}>
                                                Video Eklendi
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </>
                    )}

                    {activeTab === 'videos' && (
                        <>
                            {hasPaymentStatus && (
                                <div className={styles.paymentSummary}>
                                    <PaymentStatusBadge status="paid" /> <strong>{statusCounts.paid}</strong>
                                    <PaymentStatusBadge status="partial" /> <strong>{statusCounts.partial}</strong>
                                    <PaymentStatusBadge status="unpaid" /> <strong>{statusCounts.unpaid}</strong>
                                </div>
                            )}
                            {(() => {
                                if (assignments.length === 0) {
                                    return <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>Aracı olunan video bulunmuyor.</p>;
                                }

                                return assignments.map(assignment => {
                                    const videoInfo = videos.find(v => v.id === assignment.videoId);
                                    const customerVideoUrl = normalizeCustomerVideoUrl(
                                        typeof assignment.customerVideoUrl === 'string' ? assignment.customerVideoUrl : ''
                                    );
                                    const youtuberName = youtubers.find(y => y.id === assignment.youtuberId)?.name || assignment.name || 'Bilinmeyen YouTuber';
                                    const paymentStatus = paymentStatusOf(assignment);

                                    return (
                                        <div key={assignment.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px', lineHeight: '1.4' }}>
                                                    {videoInfo ? videoInfo.title : 'Bilinmeyen Video'}
                                                </div>
                                                {assignment.createdAt && (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                                                        {format(new Date(assignment.createdAt), 'd MMM yyyy', { locale: tr })}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                                                YouTuber: {youtuberName}
                                            </div>
                                            {paymentStatus && (
                                                <div className={styles.videoPayment} style={{ marginLeft: 0 }}>
                                                    <PaymentStatusBadge status={paymentStatus} />
                                                </div>
                                            )}
                                            {assignment.note && (
                                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                                                    Not: {assignment.note}
                                                </div>
                                            )}
                                            {customerVideoUrl && (
                                                <div className={styles.customerVideo}>
                                                    <span className={customerVideoStyles.label}>Müşteri videosu</span>
                                                    <div className={customerVideoStyles.actions}>
                                                        <a href={customerVideoUrl} target="_blank" rel="noopener noreferrer">Videoya git</a>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
