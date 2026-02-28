'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, DollarSign } from 'lucide-react';
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
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

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

    if (!isOpen) return null;

    const totalPending = payments.reduce((sum, p) => sum + p.amount, 0);

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

    return (
        <div className={modalStyles.overlay} onClick={onClose} style={{ zIndex: 101 }}>
            <div className={modalStyles.modal} style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
                <div className={modalStyles.header}>
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
                <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select
                        value={selectedYt}
                        onChange={(e) => setSelectedYt(e.target.value)}
                        style={{
                            width: '100%', padding: '10px', borderRadius: '8px',
                            backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', fontSize: '14px', outline: 'none'
                        }}
                    >
                        <option value="" disabled>YouTuber Seçin...</option>
                        {youtubers.map(yt => (
                            <option key={yt.id} value={yt.id}>{yt.name}</option>
                        ))}
                    </select>

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

                {/* Payment List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                    {payments.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0', fontSize: '14px' }}>
                            Henüz beklenen ödeme yok.
                        </div>
                    )}

                    {payments.map(p => (
                        <div key={p.id} style={{
                            backgroundColor: '#232736', border: '1px solid #33384D', borderRadius: '10px',
                            padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            {editingId === p.id ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', marginRight: '10px' }}>
                                    <input
                                        type="number"
                                        value={editAmount}
                                        onChange={(e) => setEditAmount(e.target.value)}
                                        style={{
                                            padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--accent-purple)',
                                            backgroundColor: '#1A1D28', color: 'white', fontSize: '14px', outline: 'none'
                                        }}
                                        autoFocus
                                    />
                                    <input
                                        type="text"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        placeholder="Açıklama"
                                        style={{
                                            padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
                                            backgroundColor: '#1A1D28', color: 'white', fontSize: '13px', outline: 'none'
                                        }}
                                    />
                                </div>
                            ) : (
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{p.youtuberName}</div>
                                    {p.description && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{p.description}</div>
                                    )}
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#22C55E', marginTop: '4px' }}>${p.amount.toFixed(2)}</div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {editingId === p.id ? (
                                    <>
                                        <button onClick={handleSaveEdit} style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', padding: '4px' }}>
                                            <Check size={16} />
                                        </button>
                                        <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                            <X size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => handleStartEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
