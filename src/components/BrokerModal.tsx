'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css'; // Reusing CalendarModal styles
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface BrokerModalProps {
    isOpen: boolean;
    onClose: () => void;
    brokerId: string;
    brokerName: string;
}

interface RecordData {
    id: string;
    amount: number;
    description?: string;
    date: Date;
    videoId?: string;
    youtuberId?: string;
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
}

interface VideoData {
    id: string;
    title: string;
    url: string;
}

export default function BrokerModal({
    isOpen,
    onClose,
    brokerId,
    brokerName
}: BrokerModalProps) {
    const { user } = useAuth();
    const [records, setRecords] = useState<RecordData[]>([]);
    const [assignments, setAssignments] = useState<AssignmentData[]>([]);
    const [videos, setVideos] = useState<VideoData[]>([]);
    const [activeTab, setActiveTab] = useState<'money' | 'videos'>('money');

    useEffect(() => {
        if (!isOpen || !user || !brokerId) return;

        // Fetch Records that have this brokerId
        const qRecords = query(
            collection(db, "records"),
            where("userId", "==", user.uid),
            where("brokerId", "==", brokerId)
        );

        const unsubRecords = onSnapshot(qRecords, (snapshot) => {
            const data: RecordData[] = [];
            snapshot.forEach(doc => {
                const rec = doc.data();
                if (rec.date && typeof rec.date.toDate === 'function') {
                    data.push({
                        id: doc.id,
                        amount: Number(rec.amount) || 0,
                        description: rec.description || '',
                        date: rec.date.toDate(),
                        videoId: rec.videoId,
                        youtuberId: rec.youtuberId
                    });
                }
            });
            // Newest to Oldest -> descending
            data.sort((a, b) => b.date.getTime() - a.date.getTime());
            setRecords(data);
        });

        // Fetch Assignments that have this brokerId
        const qAssignments = query(
            collection(db, "assignments"),
            where("userId", "==", user.uid),
            where("brokerId", "==", brokerId)
        );

        const unsubAssignments = onSnapshot(qAssignments, (snapshot) => {
            const data: AssignmentData[] = [];
            snapshot.forEach(doc => {
                const docData = doc.data();
                data.push({ id: doc.id, ...docData } as AssignmentData);
            });
            data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setAssignments(data);
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

        return () => { unsubRecords(); unsubAssignments(); unsubVideos(); };
    }, [isOpen, user, brokerId]);

    if (!isOpen) return null;

    const allTimeTotal = records.reduce((sum, r) => sum + r.amount, 0);

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
                            background: activeTab === 'money' ? 'var(--accent-purple)' : 'transparent',
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
                            background: activeTab === 'videos' ? 'var(--accent-purple)' : 'transparent',
                            color: activeTab === 'videos' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            flex: 1
                        }}
                    >
                        Videolar ({assignments.filter(a => videos.some(v => v.id === a.videoId)).length})
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
                                            <span style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>${record.amount}</span>
                                        </div>
                                        {record.description && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                {record.description}
                                            </div>
                                        )}
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
                            {(() => {
                                const validAssignments = assignments.filter(a => videos.some(v => v.id === a.videoId));
                                if (validAssignments.length === 0) {
                                    return <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>Aracı olunan video bulunmuyor.</p>;
                                }

                                return validAssignments.map(assignment => {
                                    const videoInfo = videos.find(v => v.id === assignment.videoId);

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
                                            {videoInfo && (
                                                <a href={videoInfo.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent-blue)' }}>
                                                    Kanalda İzle
                                                </a>
                                            )}
                                            {assignment.note && (
                                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                                                    Not: {assignment.note}
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
