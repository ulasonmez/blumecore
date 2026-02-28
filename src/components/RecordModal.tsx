'use client';

import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, DollarSign, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface RecordModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialDate?: Date;
}

interface SelectOption {
    id: string;
    name: string;
}

export default function RecordModal({ isOpen, onClose, initialDate = new Date() }: RecordModalProps) {
    const { user } = useAuth();
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [recordType, setRecordType] = useState<'income' | 'expense'>('income');
    const [selectedId, setSelectedId] = useState('');
    const [youtubers, setYoutubers] = useState<SelectOption[]>([]);
    const [teamMembers, setTeamMembers] = useState<SelectOption[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !user) return;

        const qYt = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsubYt = onSnapshot(qYt, (snapshot) => {
            const data: SelectOption[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setYoutubers(data);
        });

        const qTeam = query(collection(db, "team"), where("userId", "==", user.uid));
        const unsubTeam = onSnapshot(qTeam, (snapshot) => {
            const data: SelectOption[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setTeamMembers(data);
        });

        return () => { unsubYt(); unsubTeam(); };
    }, [isOpen, user]);

    // Reset selectedId when switching record type
    useEffect(() => {
        setSelectedId('');
    }, [recordType]);

    if (!isOpen) return null;

    const currentOptions = recordType === 'income' ? youtubers : teamMembers;
    const categoryLabel = recordType === 'income' ? 'YouTuber' : 'Ekip Üyesi';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !selectedId || !user) return;

        setIsSaving(true);
        try {
            await addDoc(collection(db, "records"), {
                userId: user.uid,
                type: recordType,
                ...(recordType === 'income'
                    ? { youtuberId: selectedId }
                    : { teamMemberId: selectedId }
                ),
                amount: parseFloat(amount),
                description: description.trim(),
                date: initialDate,
                createdAt: new Date()
            });
            onClose();
            setAmount('');
            setDescription('');
            setSelectedId('');
        } catch (error) {
            console.error("Error adding record:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Kayıt Ekle</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                        <CalendarIcon size={20} />
                        <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {format(initialDate, 'd MMMM yyyy, eeee', { locale: tr })}
                        </span>
                    </div>

                    {/* Income/Expense Toggle */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setRecordType('income')}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: '8px',
                                border: `1px solid ${recordType === 'income' ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                                backgroundColor: recordType === 'income' ? 'rgba(92, 62, 240, 0.15)' : 'var(--bg-color)',
                                color: recordType === 'income' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontWeight: 500,
                                fontSize: '14px',
                                cursor: 'pointer',
                            }}
                        >
                            <ArrowDownCircle size={16} /> Gelir
                        </button>
                        <button
                            type="button"
                            onClick={() => setRecordType('expense')}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: '8px',
                                border: `1px solid ${recordType === 'expense' ? '#EF4444' : 'var(--border-color)'}`,
                                backgroundColor: recordType === 'expense' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-color)',
                                color: recordType === 'expense' ? '#EF4444' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontWeight: 500,
                                fontSize: '14px',
                                cursor: 'pointer',
                            }}
                        >
                            <ArrowUpCircle size={16} /> Gider
                        </button>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {categoryLabel}
                        </label>
                        <select
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: 'var(--bg-color)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                fontSize: '15px',
                                outline: 'none'
                            }}
                            required
                        >
                            <option value="" disabled>Seçiniz...</option>
                            {currentOptions.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                        </select>
                        {currentOptions.length === 0 && (
                            <div style={{ fontSize: '12px', color: 'var(--accent-red)', marginTop: '4px' }}>
                                {recordType === 'income'
                                    ? 'Önce YouTubers sayfasından YouTuber eklemelisiniz.'
                                    : 'Önce Team sayfasından ekip üyesi eklemelisiniz.'
                                }
                            </div>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Miktar ($)
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>
                                <DollarSign size={18} />
                            </div>
                            <input
                                type="number"
                                placeholder="Örn: 150"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                style={{ width: '100%', paddingLeft: '38px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px 12px 12px 38px', borderRadius: '8px', outline: 'none' }}
                                required
                                min="0"
                                step="0.01"
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Açıklama <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '11px' }}>(isteğe bağlı)</span>
                        </label>
                        <textarea
                            placeholder="Örn: Sponsorluk ödemesi, AdSense geliri..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            style={{
                                width: '100%',
                                padding: '12px',
                                backgroundColor: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: '8px',
                                outline: 'none',
                                resize: 'none',
                                fontSize: '14px',
                                fontFamily: 'inherit',
                                lineHeight: '1.5',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        style={{ width: '100%', marginTop: '8px' }}
                        disabled={isSaving || currentOptions.length === 0}
                    >
                        {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </form>
            </div>
        </div>
    );
}
