'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface TeamMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    memberId: string;
    memberName: string;
}

interface RecordData {
    id: string;
    amount: number;
    description?: string;
    date: Date;
    videoId?: string;
}

export default function TeamMemberModal({
    isOpen,
    onClose,
    memberId,
    memberName
}: TeamMemberModalProps) {
    const { user } = useAuth();
    const [records, setRecords] = useState<RecordData[]>([]);

    useEffect(() => {
        if (!isOpen || !user || !memberId) return;

        const qRecords = query(
            collection(db, "records"),
            where("userId", "==", user.uid),
            where("teamMemberId", "==", memberId)
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
            // Newest to Oldest -> descending
            data.sort((a, b) => b.date.getTime() - a.date.getTime());
            setRecords(data);
        });

        return () => { unsubRecords(); };
    }, [isOpen, user, memberId]);

    if (!isOpen) return null;

    const allTimeTotal = records.reduce((sum, r) => sum + r.amount, 0);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title} style={{ marginBottom: '4px' }}>{memberName}</h2>
                        <span style={{ fontSize: '12px', color: 'var(--accent-purple)' }}>Ekip Üyesi Bilgileri</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} style={{ alignSelf: 'flex-start' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.statsRow} style={{ gridTemplateColumns: '1fr', marginBottom: '16px' }}>
                    <div className={styles.statCard}>
                        <div className={styles.statValue}>${allTimeTotal}</div>
                        <div className={styles.statLabel}>Toplam Ödeme</div>
                    </div>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
