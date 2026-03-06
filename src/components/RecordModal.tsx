'use client';

import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, DollarSign, ArrowDownCircle, ArrowUpCircle, Youtube } from 'lucide-react';
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

interface VideoOption {
    id: string;
    title: string;
    url: string;
    createdAt?: number;
}

export default function RecordModal({ isOpen, onClose, initialDate = new Date() }: RecordModalProps) {
    const { user } = useAuth();
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [recordType, setRecordType] = useState<'income' | 'expense' | 'video'>('income');
    const [selectedId, setSelectedId] = useState('');
    const [selectedVideoId, setSelectedVideoId] = useState('');
    const [youtubers, setYoutubers] = useState<SelectOption[]>([]);
    const [teamMembers, setTeamMembers] = useState<SelectOption[]>([]);
    const [brokers, setBrokers] = useState<SelectOption[]>([]);
    const [videos, setVideos] = useState<VideoOption[]>([]);
    const [selectedBrokerId, setSelectedBrokerId] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // New states for searchable video dropdown
    const [isVideoDropdownOpen, setIsVideoDropdownOpen] = useState(false);
    const [videoSearchTerm, setVideoSearchTerm] = useState('');

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
            const membersData: SelectOption[] = [];
            const brokersData: SelectOption[] = [];

            snapshot.forEach(doc => {
                const docData = doc.data();
                const item = { id: doc.id, name: docData.name };
                if (docData.role === 'broker') {
                    brokersData.push(item);
                } else {
                    membersData.push(item);
                }
            });

            setTeamMembers(membersData);
            setBrokers(brokersData);
        });

        const qVideos = query(collection(db, "youtube_videos"), where("userId", "==", user.uid));
        const unsubVideos = onSnapshot(qVideos, (snapshot) => {
            const data: VideoOption[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as VideoOption));
            data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setVideos(data as VideoOption[]);
        });

        return () => { unsubYt(); unsubTeam(); unsubVideos(); };
    }, [isOpen, user]);

    // Reset selectedId, selectedVideoId, and UI states when switching record type
    useEffect(() => {
        setSelectedId('');
        setSelectedVideoId('');
        setSelectedBrokerId('');
        setVideoSearchTerm('');
        setIsVideoDropdownOpen(false);
    }, [recordType]);

    if (!isOpen) return null;

    const currentOptions = (recordType === 'income' || recordType === 'video') ? youtubers : teamMembers;
    const categoryLabel = (recordType === 'income' || recordType === 'video') ? 'YouTuber' : 'Ekip Üyesi';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // For video, amount is not needed. For others, amount is required.
        if (!selectedId || !user) return;
        if (recordType !== 'video' && !amount) return;
        if (recordType === 'video' && !selectedVideoId) return;

        setIsSaving(true);
        try {
            if (recordType === 'video') {
                const selectedYoutuber = youtubers.find(y => y.id === selectedId);
                if (selectedYoutuber) {
                    await addDoc(collection(db, "assignments"), {
                        videoId: selectedVideoId,
                        youtuberId: selectedId,
                        name: selectedYoutuber.name,
                        delivered: false,
                        note: description.trim(),
                        userId: user.uid,
                        createdAt: initialDate.getTime(),
                        source: 'calendar',
                        brokerId: selectedBrokerId || null
                    });
                }
            } else {
                const recordData: Record<string, unknown> = {
                    userId: user.uid,
                    type: recordType,
                    ...(recordType === 'income'
                        ? { youtuberId: selectedId, brokerId: selectedBrokerId || null }
                        : { teamMemberId: selectedId }
                    ),
                    amount: parseFloat(amount),
                    description: description.trim(),
                    date: initialDate,
                    createdAt: new Date()
                };

                await addDoc(collection(db, "records"), recordData);
            }

            onClose();
            setAmount('');
            setDescription('');
            setSelectedId('');
            setSelectedVideoId('');
            setSelectedBrokerId('');
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

                    {/* Income/Expense/Video Toggle */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setRecordType('income')}
                            style={{
                                flex: 1,
                                padding: '10px 4px',
                                borderRadius: '8px',
                                border: `1px solid ${recordType === 'income' ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                                backgroundColor: recordType === 'income' ? 'rgba(92, 62, 240, 0.15)' : 'var(--bg-color)',
                                color: recordType === 'income' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                fontWeight: 500,
                                fontSize: '13px',
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
                                padding: '10px 4px',
                                borderRadius: '8px',
                                border: `1px solid ${recordType === 'expense' ? '#EF4444' : 'var(--border-color)'}`,
                                backgroundColor: recordType === 'expense' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-color)',
                                color: recordType === 'expense' ? '#EF4444' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                fontWeight: 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            <ArrowUpCircle size={16} /> Gider
                        </button>
                        <button
                            type="button"
                            onClick={() => setRecordType('video')}
                            style={{
                                flex: 1,
                                padding: '10px 4px',
                                borderRadius: '8px',
                                border: `1px solid ${recordType === 'video' ? '#3B82F6' : 'var(--border-color)'}`,
                                backgroundColor: recordType === 'video' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-color)',
                                color: recordType === 'video' ? '#3B82F6' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                fontWeight: 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            <Youtube size={16} /> Video
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

                    {recordType === 'video' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Video Seç <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '11px' }}>(gerekli)</span>
                            </label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)', zIndex: 1 }}>
                                    <Youtube size={18} />
                                </div>

                                <div
                                    style={{
                                        width: '100%',
                                        backgroundColor: 'var(--bg-color)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        position: 'relative'
                                    }}
                                >
                                    <input
                                        type="text"
                                        placeholder="Video ara veya seç..."
                                        value={isVideoDropdownOpen ? videoSearchTerm : (videos.find(v => v.id === selectedVideoId)?.title || '')}
                                        onChange={(e) => {
                                            setVideoSearchTerm(e.target.value);
                                            setIsVideoDropdownOpen(true);
                                            if (!e.target.value) {
                                                setSelectedVideoId('');
                                            }
                                        }}
                                        onFocus={() => setIsVideoDropdownOpen(true)}
                                        style={{
                                            width: '100%',
                                            padding: '12px 12px 12px 38px',
                                            backgroundColor: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-primary)',
                                            fontSize: '14px',
                                            outline: 'none',
                                            cursor: 'text'
                                        }}
                                    />

                                    {isVideoDropdownOpen && (
                                        <>
                                            <div
                                                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }}
                                                onClick={() => {
                                                    setIsVideoDropdownOpen(false);
                                                    setVideoSearchTerm('');
                                                }}
                                            />
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                marginTop: '4px',
                                                backgroundColor: 'var(--bg-card)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                zIndex: 10,
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                            }}>
                                                {videos.filter(v => v.title.toLowerCase().includes(videoSearchTerm.toLowerCase())).length === 0 ? (
                                                    <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                                                        Aramanıza uygun video bulunamadı.
                                                    </div>
                                                ) : (
                                                    videos.filter(v => v.title.toLowerCase().includes(videoSearchTerm.toLowerCase())).map(v => (
                                                        <div
                                                            key={v.id}
                                                            onClick={() => {
                                                                setSelectedVideoId(v.id);
                                                                setIsVideoDropdownOpen(false);
                                                                setVideoSearchTerm('');
                                                            }}
                                                            style={{
                                                                padding: '10px 12px',
                                                                cursor: 'pointer',
                                                                fontSize: '13px',
                                                                color: selectedVideoId === v.id ? 'var(--accent-purple)' : 'var(--text-primary)',
                                                                backgroundColor: selectedVideoId === v.id ? 'rgba(92, 62, 240, 0.1)' : 'transparent',
                                                                borderBottom: '1px solid var(--border-color)',
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-color)'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedVideoId === v.id ? 'rgba(92, 62, 240, 0.1)' : 'transparent'}
                                                        >
                                                            {v.title}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {recordType !== 'video' && (
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
                                    required={recordType as string !== 'video'}
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        </div>
                    )}

                    {(recordType === 'income' || recordType === 'video') && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Aracı <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '11px' }}>(isteğe bağlı)</span>
                            </label>
                            <select
                                value={selectedBrokerId}
                                onChange={(e) => setSelectedBrokerId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--bg-color)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            >
                                <option value="">Aracı seçilmedi</option>
                                {brokers.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

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
                        disabled={isSaving || currentOptions.length === 0 || (recordType as string === 'video' && !selectedVideoId)}
                    >
                        {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </form>
            </div>
        </div>
    );
}
