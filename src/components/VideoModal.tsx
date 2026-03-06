'use client';

import { useState, useEffect } from 'react';
import { X, Check, Trash2, Link as LinkIcon, Plus } from 'lucide-react';
import modalStyles from '@/components/CalendarModal.module.css'; // Reuse base modal styles
import styles from '@/app/home/Home.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface YoutuberAssignment {
    id: string;
    youtuberId: string;
    name: string;
    delivered: boolean;
    note: string;
    createdAt?: number;
}

interface VideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    video: { id: string; url: string; title: string };
    assignments: YoutuberAssignment[];
    onUpdateAssignment: (id: string, updates: Partial<YoutuberAssignment>) => void;
    onDeleteAssignment: (id: string) => void;
    onAddAssignment: (youtuberId: string, name: string) => void;
}



export default function VideoModal({
    isOpen,
    onClose,
    video,
    assignments,
    onUpdateAssignment,
    onDeleteAssignment,
    onAddAssignment
}: VideoModalProps) {
    const { user } = useAuth();
    const [selectedYtId, setSelectedYtId] = useState('');
    const [youtubers, setYoutubers] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        if (!isOpen || !user) return;
        const q = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsub = onSnapshot(q, (snapshot) => {
            const data: any[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setYoutubers(data);
        });
        return () => unsub();
    }, [isOpen, user]);

    if (!isOpen) return null;

    const handleAdd = () => {
        if (!selectedYtId) return;
        const yt = youtubers.find(y => y.id === selectedYtId);
        if (yt) {
            onAddAssignment(yt.id, yt.name);
            setSelectedYtId('');
        }
    };

    return (
        <div className={modalStyles.overlay} onClick={onClose} style={{ zIndex: 100 }}>
            {/* We use a slightly wider modal for video details */}
            <div
                className={modalStyles.modal}
                style={{ maxWidth: '480px' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={modalStyles.header} style={{ marginBottom: '16px' }}>
                    <h2 className={styles.modalTitle} title={video.title}>
                        {video.title}
                    </h2>
                    <button className={modalStyles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.linkRow}>
                    <LinkIcon size={14} color="var(--text-secondary)" />
                    <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent-blue)' }}>
                        {video.url.length > 50 ? video.url.substring(0, 50) + '...' : video.url}
                    </a>
                </div>

                <div className={styles.addYoutuberForm}>
                    <select
                        value={selectedYtId}
                        onChange={(e) => setSelectedYtId(e.target.value)}
                    >
                        <option value="" disabled>Youtuber Seçin...</option>
                        {youtubers.map(yt => (
                            <option key={yt.id} value={yt.id}>{yt.name}</option>
                        ))}
                    </select>
                    <button
                        className="btn-primary"
                        style={{ padding: '0 16px' }}
                        onClick={handleAdd}
                        disabled={!selectedYtId}
                    >
                        <Plus size={18} />
                    </button>
                </div>

                <div className={styles.youtuberList}>
                    {assignments.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', padding: '20px 0' }}>
                            Henüz kimse atanmamış.
                        </div>
                    )}

                    {assignments.map(a => (
                        <div key={a.id} className={`${styles.youtuberRow} ${a.delivered ? styles.delivered : ''}`}>
                            <div
                                className={styles.checkboxContainer}
                                onClick={() => onUpdateAssignment(a.id, { delivered: !a.delivered })}
                            >
                                <div className={`${styles.checkbox} ${a.delivered ? styles.checked : ''}`}>
                                    {a.delivered && <Check size={16} />}
                                </div>
                            </div>

                            <div className={styles.youtuberInfo}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className={styles.youtuberName}>{a.name}</div>
                                    {a.createdAt && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            • {new Date(a.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    className={styles.noteInput}
                                    placeholder="Not: Örn. 1000$ anlaşıldı"
                                    value={a.note}
                                    onChange={(e) => onUpdateAssignment(a.id, { note: e.target.value })}
                                />
                            </div>

                            <button className={styles.deleteYoutuberBtn} onClick={() => onDeleteAssignment(a.id)}>
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
