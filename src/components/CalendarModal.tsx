'use client';

import { X, Gamepad2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import MinecraftPlayersTab from './MinecraftPlayersTab';
import DiscordContactEditor from './DiscordContactEditor';

interface CalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    youtuberId: string;
    title: string;
    channelUrl?: string;
}

interface RecordData {
    id: string;
    amount: number;
    description?: string;
    date: Date;
    videoId?: string;
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

export default function CalendarModal({
    isOpen,
    onClose,
    youtuberId,
    title,
    channelUrl,
}: CalendarModalProps) {
    const { user } = useAuth();
    const [records, setRecords] = useState<RecordData[]>([]);
    const [assignments, setAssignments] = useState<AssignmentData[]>([]);
    const [videos, setVideos] = useState<VideoData[]>([]);
    const [activeTab, setActiveTab] = useState<'money' | 'videos' | 'players'>('money');

    useEffect(() => {
        if (!isOpen || !user || !youtuberId) return;

        // Fetch Records
        const qRecords = query(
            collection(db, "records"),
            where("userId", "==", user.uid),
            where("youtuberId", "==", youtuberId)
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
                        videoId: rec.videoId
                    });
                }
            });
            // Sort by earliest date to latest date? User requested: "en son tarihten ilk tarihe kadar" -> Newest to Oldest -> descending
            data.sort((a, b) => b.date.getTime() - a.date.getTime());
            setRecords(data);
        });

        // Fetch Assignments
        const qAssignments = query(
            collection(db, "assignments"),
            where("userId", "==", user.uid),
            where("youtuberId", "==", youtuberId)
        );

        const unsubAssignments = onSnapshot(qAssignments, (snapshot) => {
            const data: AssignmentData[] = [];
            snapshot.forEach(doc => {
                const docData = doc.data();
                if (docData.source !== 'mods' && docData.videoId) {
                    data.push({ id: doc.id, ...docData } as AssignmentData);
                }
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
    }, [isOpen, user, youtuberId]);

    if (!isOpen) return null;

    const allTimeTotal = records.reduce((sum, r) => sum + r.amount, 0);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title} style={{ marginBottom: channelUrl ? '4px' : '0' }}>{title}</h2>
                        {channelUrl && (
                            <a
                                href={channelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '12px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span style={{ textDecoration: 'underline' }}>Kanalı Ziyaret Et</span>
                            </a>
                        )}
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} style={{ alignSelf: 'flex-start' }}>
                        <X size={24} />
                    </button>
                </div>

                <DiscordContactEditor key={youtuberId} youtuberId={youtuberId} />

                <div className={styles.statsRow} style={{ gridTemplateColumns: '1fr', marginBottom: '16px' }}>
                    <div className={styles.statCard}>
                        <div className={styles.statValue}>${allTimeTotal}</div>
                        <div className={styles.statLabel}>Toplam Ciro</div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <button
                        onClick={() => setActiveTab('money')}
                        style={{
                            padding: '8px 12px',
                            background: activeTab === 'money' ? 'var(--action-green)' : 'transparent',
                            color: activeTab === 'money' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 500,
                            fontSize: '13px',
                            cursor: 'pointer',
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        Para
                    </button>
                    <button
                        onClick={() => setActiveTab('videos')}
                        style={{
                            padding: '8px 12px',
                            background: activeTab === 'videos' ? 'var(--action-green)' : 'transparent',
                            color: activeTab === 'videos' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 500,
                            fontSize: '13px',
                            cursor: 'pointer',
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        Videolar
                    </button>
                    <button
                        onClick={() => setActiveTab('players')}
                        style={{
                            padding: '8px 12px',
                            background: activeTab === 'players' ? 'var(--action-green)' : 'transparent',
                            color: activeTab === 'players' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 500,
                            fontSize: '13px',
                            cursor: 'pointer',
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        <Gamepad2 size={15} />
                        Oyuncular
                    </button>
                </div>

                {/* Tab Content */}
                <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

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
                                    return <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>Atanan video bulunmuyor.</p>;
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

                    {activeTab === 'players' && (
                        <MinecraftPlayersTab
                            youtuberId={youtuberId}
                            youtuberTitle={title}
                        />
                    )}

                </div>
            </div>
        </div>
    );
}
