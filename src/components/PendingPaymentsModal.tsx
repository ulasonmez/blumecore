'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Edit2, Check, DollarSign, User, ChevronDown, ChevronUp } from 'lucide-react';
import modalStyles from '@/components/CalendarModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface PendingPayment {
    id: string;
    youtuberId: string;
    youtuberName: string;
    amount: number;
    description: string;
}

interface GroupedPendingPayment {
    youtuberKey: string;
    youtuberId: string;
    youtuberName: string;
    totalAmount: number;
    items: PendingPayment[];
}

interface PendingPaymentsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PendingPaymentsModal({ isOpen, onClose }: PendingPaymentsModalProps) {
    const { user } = useAuth();
    const [payments, setPayments] = useState<PendingPayment[]>([]);
    const [youtubers, setYoutubers] = useState<{ id: string; name: string }[]>([]);

    // Add form state
    const [selectedYt, setSelectedYt] = useState('');
    const [isYtDropdownOpen, setIsYtDropdownOpen] = useState(false);
    const [ytSearchTerm, setYtSearchTerm] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    // Accordion state
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editDescription, setEditDescription] = useState('');

    useEffect(() => {
        if (!isOpen || !user) return;

        const qPayments = query(collection(db, "pendingPayments"), where("userId", "==", user.uid));
        const unsubPayments = onSnapshot(qPayments, (snapshot) => {
            const data: PendingPayment[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as PendingPayment));
            setPayments(data);
        });

        const qYt = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsubYt = onSnapshot(qYt, (snapshot) => {
            const data: { id: string; name: string }[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setYoutubers(data);
        });

        return () => { unsubPayments(); unsubYt(); };
    }, [isOpen, user]);

    // Reset fields when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedYt('');
            setIsYtDropdownOpen(false);
            setYtSearchTerm('');
            setAmount('');
            setDescription('');
            setEditingId(null);
            setCollapsedGroups({});
        }
    }, [isOpen]);

    const totalPending = payments.reduce((sum, p) => sum + p.amount, 0);

    const groupedPayments = useMemo(() => {
        const map = new Map<string, GroupedPendingPayment>();
        payments.forEach(p => {
            const key = p.youtuberId || p.youtuberName || 'unknown';
            if (!map.has(key)) {
                map.set(key, {
                    youtuberKey: key,
                    youtuberId: p.youtuberId,
                    youtuberName: p.youtuberName || 'Bilinmeyen YouTuber',
                    totalAmount: 0,
                    items: []
                });
            }
            const group = map.get(key)!;
            group.totalAmount += p.amount;
            group.items.push(p);
        });
        return Array.from(map.values());
    }, [payments]);

    const toggleGroup = (key: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    if (!isOpen) return null;

    const handleAdd = async () => {
        if (!selectedYt || !amount || !user) return;
        const yt = youtubers.find(y => y.id === selectedYt);
        if (!yt) return;

        try {
            await addDoc(collection(db, "pendingPayments"), {
                youtuberId: selectedYt,
                youtuberName: yt.name,
                amount: parseFloat(amount),
                description: description.trim(),
                userId: user.uid,
                createdAt: new Date()
            });
            setSelectedYt('');
            setYtSearchTerm('');
            setIsYtDropdownOpen(false);
            setAmount('');
            setDescription('');
        } catch (e) {
            console.error("Error adding pending payment:", e);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(db, "pendingPayments", id));
        } catch (e) {
            console.error("Error deleting pending payment:", e);
        }
    };

    const handleStartEdit = (p: PendingPayment) => {
        setEditingId(p.id);
        setEditAmount(p.amount.toString());
        setEditDescription(p.description);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editAmount) return;
        try {
            await updateDoc(doc(db, "pendingPayments", editingId), {
                amount: parseFloat(editAmount),
                description: editDescription.trim()
            });
            setEditingId(null);
        } catch (e) {
            console.error("Error updating pending payment:", e);
        }
    };

    const filteredYoutubers = youtubers.filter(yt =>
        yt.name.toLowerCase().includes(ytSearchTerm.toLowerCase())
    );

    return (
        <div className={modalStyles.overlay} onClick={onClose} style={{ zIndex: 101 }}>
            <div className={modalStyles.modal} style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={modalStyles.header} style={{ flexShrink: 0, marginBottom: '16px' }}>
                    <div>
                        <h2 className={modalStyles.title}>Beklenen Ödemeler</h2>
                        <span style={{ fontSize: '13px', color: 'var(--accent-purple)', fontWeight: 600 }}>
                            Toplam: ${totalPending.toFixed(2)}
                        </span>
                    </div>
                    <button className={modalStyles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Add Form */}
                <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                    {/* Searchable YouTuber selector */}
                    <div style={{ position: 'relative' }}>
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
                                placeholder="YouTuber ara veya seç..."
                                value={isYtDropdownOpen ? ytSearchTerm : (youtubers.find(opt => opt.id === selectedYt)?.name || '')}
                                onChange={(e) => {
                                    setYtSearchTerm(e.target.value);
                                    setIsYtDropdownOpen(true);
                                    if (!e.target.value) {
                                        setSelectedYt('');
                                    }
                                }}
                                onFocus={() => setIsYtDropdownOpen(true)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    outline: 'none',
                                    cursor: 'text'
                                }}
                            />

                            {isYtDropdownOpen && (
                                <>
                                    <div
                                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }}
                                        onClick={() => {
                                            setIsYtDropdownOpen(false);
                                            setYtSearchTerm('');
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
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }}>
                                        {filteredYoutubers.length === 0 ? (
                                            <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                                                Aramanıza uygun YouTuber bulunamadı.
                                            </div>
                                        ) : (
                                            filteredYoutubers.map(opt => (
                                                <div
                                                    key={opt.id}
                                                    onClick={() => {
                                                        setSelectedYt(opt.id);
                                                        setIsYtDropdownOpen(false);
                                                        setYtSearchTerm('');
                                                    }}
                                                    style={{
                                                        padding: '10px 12px',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        color: selectedYt === opt.id ? 'var(--accent-purple)' : 'var(--text-primary)',
                                                        backgroundColor: selectedYt === opt.id ? 'rgba(92, 62, 240, 0.1)' : 'transparent',
                                                        borderBottom: '1px solid var(--border-color)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-color)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedYt === opt.id ? 'rgba(92, 62, 240, 0.1)' : 'transparent'}
                                                >
                                                    {opt.name}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <DollarSign size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="number"
                                placeholder="Miktar"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px',
                                    backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none'
                                }}
                                min="0"
                                step="0.01"
                            />
                        </div>
                        <button
                            onClick={handleAdd}
                            disabled={!selectedYt || !amount}
                            style={{
                                padding: '0 16px', backgroundColor: 'var(--accent-purple)', color: 'white',
                                borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500,
                                opacity: (!selectedYt || !amount) ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <input
                        type="text"
                        placeholder="Açıklama (opsiyonel)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        style={{
                            width: '100%', padding: '10px', borderRadius: '8px',
                            backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', fontSize: '14px', outline: 'none'
                        }}
                    />
                </div>

                {/* Grouped Payment List */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    overflowY: 'auto',
                    paddingRight: '4px',
                    flex: 1
                }}>
                    {groupedPayments.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 0', fontSize: '14px' }}>
                            Henüz beklenen ödeme yok.
                        </div>
                    )}

                    {groupedPayments.map(group => {
                        const isCollapsed = !!collapsedGroups[group.youtuberKey];
                        return (
                            <div
                                key={group.youtuberKey}
                                style={{
                                    backgroundColor: '#232736',
                                    border: '1px solid #33384D',
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    flexShrink: 0
                                }}
                            >
                                {/* YouTuber Group Header */}
                                <div
                                    onClick={() => toggleGroup(group.youtuberKey)}
                                    style={{
                                        padding: '11px 14px',
                                        backgroundColor: 'rgba(92, 62, 240, 0.12)',
                                        borderBottom: isCollapsed ? 'none' : '1px solid #33384D',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        userSelect: 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <User size={15} style={{ color: 'var(--accent-purple)' }} />
                                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                                            {group.youtuberName}
                                        </span>
                                        <span style={{
                                            fontSize: '11px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                            padding: '2px 7px',
                                            borderRadius: '10px',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            {group.items.length} ödeme
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-purple)' }}>
                                            Toplam: ${group.totalAmount.toFixed(2)}
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                                            {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Sub-items for this YouTuber */}
                                {!isCollapsed && (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {group.items.map((p, index) => (
                                            <div
                                                key={p.id}
                                                style={{
                                                    padding: '10px 14px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    borderTop: index > 0 ? '1px solid #2D3244' : 'none',
                                                    backgroundColor: index % 2 === 1 ? 'rgba(0, 0, 0, 0.12)' : 'transparent'
                                                }}
                                            >
                                                {editingId === p.id ? (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', marginRight: '10px' }}
                                                    >
                                                        <input
                                                            type="number"
                                                            value={editAmount}
                                                            onChange={(e) => setEditAmount(e.target.value)}
                                                            style={{
                                                                padding: '6px 8px',
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--accent-purple)',
                                                                backgroundColor: '#1A1D28',
                                                                color: 'white',
                                                                fontSize: '14px',
                                                                outline: 'none'
                                                            }}
                                                            autoFocus
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editDescription}
                                                            onChange={(e) => setEditDescription(e.target.value)}
                                                            placeholder="Açıklama"
                                                            style={{
                                                                padding: '6px 8px',
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--border-color)',
                                                                backgroundColor: '#1A1D28',
                                                                color: 'white',
                                                                fontSize: '13px',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div style={{ flex: 1, marginRight: '10px' }}>
                                                        {p.description ? (
                                                            <div style={{ fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                                                {p.description}
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                                Ödeme
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#22C55E', marginTop: '2px' }}>
                                                            ${p.amount.toFixed(2)}
                                                        </div>
                                                    </div>
                                                )}

                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
                                                >
                                                    {editingId === p.id ? (
                                                        <>
                                                            <button
                                                                onClick={handleSaveEdit}
                                                                title="Kaydet"
                                                                style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingId(null)}
                                                                title="İptal"
                                                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleStartEdit(p)}
                                                                title="Düzenle"
                                                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(p.id)}
                                                                title="Sil"
                                                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
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
