'use client';

import { X, Gamepad2, Video, Edit2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import MinecraftPlayersTab from './MinecraftPlayersTab';
import DiscordContactEditor from './DiscordContactEditor';
import ChannelLinkEditor from './ChannelLinkEditor';
import CustomerVideoLink from './CustomerVideoLink';
import RecordModal, { type RecordEditData } from './RecordModal';
import { PaymentStatusBadge } from './PaymentVideoLinks';
import {
    buildVideoPaymentMap,
    getVideoPaymentStatus,
    resolveRecordPaidVideos,
} from '@/lib/payment-links';

interface CalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    youtuberId: string;
    title: string;
    channelUrl?: string;
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
    customerVideoUrl?: string;
    brokerId?: string;
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
    const [editRecord, setEditRecord] = useState<RecordData | null>(null);
    const [noteEdit, setNoteEdit] = useState<{ assignmentId: string; draft: string } | null>(null);
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteError, setNoteError] = useState('');

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
            snapshot.forEach(recordDoc => {
                const rec = recordDoc.data();
                if (rec.date && typeof rec.date.toDate === 'function') {
                    data.push({
                        id: recordDoc.id,
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
            snapshot.forEach(assignmentDoc => {
                const docData = assignmentDoc.data();
                if (docData.source !== 'mods' && docData.videoId) {
                    data.push({ id: assignmentDoc.id, ...docData } as AssignmentData);
                }
            });
            data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setAssignments(data);
        });

        // Fetch Videos
        const qVideos = query(collection(db, "youtube_videos"), where("userId", "==", user.uid));
        const unsubVideos = onSnapshot(qVideos, (snapshot) => {
            const vids: VideoData[] = [];
            snapshot.forEach(videoDoc => {
                vids.push({ id: videoDoc.id, ...videoDoc.data() } as VideoData);
            });
            setVideos(vids);
        });

        return () => { unsubRecords(); unsubAssignments(); unsubVideos(); };
    }, [isOpen, user, youtuberId]);

    if (!isOpen) return null;

    const allTimeTotal = records.reduce((sum, r) => sum + r.amount, 0);
    const assignmentToVideo = new Map(assignments.map(a => [a.id, a.videoId]));
    const paymentMap = buildVideoPaymentMap(records, assignmentToVideo);
    const validAssignments = assignments.filter(a => videos.some(v => v.id === a.videoId));
    const videoTitle = (videoId: string) => videos.find(v => v.id === videoId)?.title || 'Bilinmeyen Video';
    const statusCounts = validAssignments.reduce(
        (acc, a) => { acc[getVideoPaymentStatus(paymentMap, a.videoId)] += 1; return acc; },
        { paid: 0, partial: 0, unpaid: 0 }
    );
    const saveNote = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!noteEdit) return;
        setNoteSaving(true);
        setNoteError('');
        try {
            await updateDoc(doc(db, 'assignments', noteEdit.assignmentId), { note: noteEdit.draft.trim() });
            setNoteEdit(null);
        } catch {
            setNoteError('Not kaydedilemedi. Lütfen tekrar deneyin.');
        } finally {
            setNoteSaving(false);
        }
    };
    const editButtonStyle = { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' } as const;

    return (
        <>
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

                <ChannelLinkEditor key={`channel-${youtuberId}`} youtuberId={youtuberId} />

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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>
                                                {format(record.date, 'd MMMM yyyy', { locale: tr })}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>${record.amount}</span>
                                                <button type="button" aria-label="Ödemeyi düzenle" title="Düzenle" style={editButtonStyle} onClick={() => setEditRecord(record)}>
                                                    <Edit2 size={14} />
                                                </button>
                                            </span>
                                        </div>
                                        {record.description && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                {record.description}
                                            </div>
                                        )}
                                        {(() => {
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
                            {validAssignments.length > 0 && (
                                <div className={styles.paymentSummary}>
                                    <PaymentStatusBadge status="paid" /> <strong>{statusCounts.paid}</strong>
                                    <PaymentStatusBadge status="partial" /> <strong>{statusCounts.partial}</strong>
                                    <PaymentStatusBadge status="unpaid" /> <strong>{statusCounts.unpaid}</strong>
                                </div>
                            )}
                            {(() => {
                                if (validAssignments.length === 0) {
                                    return <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>Atanan video bulunmuyor.</p>;
                                }

                                return validAssignments.map(assignment => {
                                    const videoInfo = videos.find(v => v.id === assignment.videoId);
                                    const paymentStatus = getVideoPaymentStatus(paymentMap, assignment.videoId);
                                    const isEditingNote = noteEdit?.assignmentId === assignment.id;

                                    return (
                                        <div key={assignment.id} className={styles.videoCard}>
                                            <div className={styles.videoHeader}>
                                                <div className={styles.videoHeading}>
                                                    <span className={styles.videoIcon}><Video size={16} aria-hidden="true" /></span>
                                                    <div className={styles.videoTitle}>{videoInfo ? videoInfo.title : 'Bilinmeyen Video'}</div>
                                                </div>
                                                <div className={styles.videoMeta}>
                                                    {assignment.createdAt && (
                                                        <span className={styles.videoDate}>
                                                            {format(new Date(assignment.createdAt), 'd MMM yyyy', { locale: tr })}
                                                        </span>
                                                    )}
                                                    <button type="button" aria-label="Notu düzenle" title="Notu düzenle" style={editButtonStyle} onClick={() => { setNoteError(''); setNoteEdit({ assignmentId: assignment.id, draft: assignment.note || '' }); }} disabled={noteSaving}>
                                                        <Edit2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={styles.videoPayment}>
                                                <PaymentStatusBadge status={paymentStatus} />
                                            </div>
                                            {videoInfo && (
                                                <a href={videoInfo.url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                                                    Orijinal videoyu izle ↗
                                                </a>
                                            )}
                                            {isEditingNote ? (
                                                <form className={styles.noteEditor} onSubmit={saveNote}>
                                                    <label htmlFor={`note-${assignment.id}`}>Not</label>
                                                    <textarea
                                                        id={`note-${assignment.id}`}
                                                        rows={2}
                                                        value={noteEdit.draft}
                                                        onChange={(e) => setNoteEdit({ assignmentId: assignment.id, draft: e.target.value })}
                                                        disabled={noteSaving}
                                                        autoFocus
                                                    />
                                                    <div className={styles.noteActions}>
                                                        <button className="btn-primary" type="submit" disabled={noteSaving}>{noteSaving ? 'Kaydediliyor…' : 'Kaydet'}</button>
                                                        <button type="button" onClick={() => { setNoteEdit(null); setNoteError(''); }} disabled={noteSaving}>Vazgeç</button>
                                                    </div>
                                                    {noteError && <p className={styles.noteError} role="alert">{noteError}</p>}
                                                </form>
                                            ) : assignment.note && (
                                                <div className={styles.videoNote}>
                                                    Not: {assignment.note}
                                                </div>
                                            )}
                                            <div className={styles.customerVideo}><CustomerVideoLink assignmentId={assignment.id} url={assignment.customerVideoUrl} /></div>
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
        {editRecord && (
            <RecordModal
                isOpen={true}
                onClose={() => setEditRecord(null)}
                initialDate={editRecord.date}
                editData={editRecord as unknown as RecordEditData}
                editType="record"
            />
        )}
        </>
    );
}
