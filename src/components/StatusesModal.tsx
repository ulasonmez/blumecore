'use client';

import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, ArrowUp, ArrowDown } from 'lucide-react';
import modalStyles from '@/components/CalendarModal.module.css';
import styles from '@/app/home/Home.module.css';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface Status {
    id: string;
    name: string;
    color: string;
    order: number;
}

interface FollowUp {
    status: string;
}

interface StatusesModalProps {
    isOpen: boolean;
    onClose: () => void;
    statuses: Status[];
    followUps: FollowUp[];
}

const PRESETS = ['#9880FF', '#FFB300', '#6397F2', '#F45F5B', '#4ADE80', '#A6AEBF', '#E040FB', '#5C3EF0'];

export default function StatusesModal({ isOpen, onClose, statuses, followUps }: StatusesModalProps) {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [color, setColor] = useState('#5C3EF0');
    
    // Edit Mode State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');

    if (!isOpen) return null;

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !user) return;

        // Check duplicate
        if (statuses.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
            alert("Bu statü zaten mevcut!");
            return;
        }

        const maxOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.order)) : -1;

        try {
            await addDoc(collection(db, "statuses"), {
                name: name.trim(),
                color,
                order: maxOrder + 1,
                userId: user.uid,
                createdAt: Date.now()
            });
            setName('');
            setColor('#5C3EF0');
        } catch (err) {
            console.error("Error adding status:", err);
        }
    };

    const handleDelete = async (status: Status) => {
        // Prevent deletion if in use
        const inUse = followUps.some(f => f.status === status.name);
        if (inUse) {
            alert(`"${status.name}" statüsü kullanımda olduğu için silinemez. Lütfen önce bu statüdeki kişilerin aşamasını güncelleyin!`);
            return;
        }

        if (confirm(`"${status.name}" statüsünü silmek istediğinize emin misiniz?`)) {
            try {
                await deleteDoc(doc(db, "statuses", status.id));
            } catch (err) {
                console.error("Error deleting status:", err);
            }
        }
    };

    const startEdit = (status: Status) => {
        setEditingId(status.id);
        setEditName(status.name);
        setEditColor(status.color);
    };

    const handleSaveEdit = async (id: string, oldName: string) => {
        if (!editName.trim()) return;

        // Check duplicates excluding itself
        if (statuses.some(s => s.id !== id && s.name.toLowerCase() === editName.trim().toLowerCase())) {
            alert("Bu statü ismi zaten kullanımda!");
            return;
        }

        try {
            await updateDoc(doc(db, "statuses", id), {
                name: editName.trim(),
                color: editColor
            });
            
            setEditingId(null);
        } catch (err) {
            console.error("Error saving status edit:", err);
        }
    };

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= statuses.length) return;

        const current = statuses[index];
        const target = statuses[targetIndex];

        try {
            // Swap orders
            await updateDoc(doc(db, "statuses", current.id), { order: target.order });
            await updateDoc(doc(db, "statuses", target.id), { order: current.order });
        } catch (err) {
            console.error("Error reordering status:", err);
        }
    };

    return (
        <div className={modalStyles.overlay} onClick={onClose} style={{ zIndex: 101 }}>
            <div className={modalStyles.modal} style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
                <div className={modalStyles.header} style={{ marginBottom: '16px' }}>
                    <div>
                        <h2 className={modalStyles.title}>Takip Aşamalarını Yönet</h2>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Aşamaları ekleyin, düzenleyin, silin ve sıralayın.
                        </span>
                    </div>
                    <button className={modalStyles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Create Status Form */}
                <form onSubmit={handleAdd} style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Yeni statü adı..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                flex: 1, padding: '8px 12px', borderRadius: '6px',
                                backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
                                color: 'white', fontSize: '14px', outline: 'none'
                            }}
                            required
                        />
                        <button
                            type="submit"
                            style={{
                                padding: '0 14px', backgroundColor: 'var(--accent-purple)', color: 'white',
                                borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '13px',
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <Plus size={16} /> Ekle
                        </button>
                    </div>

                    {/* Predefined colors picker */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '4px' }}>Renk:</span>
                        {PRESETS.map(preset => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setColor(preset)}
                                style={{
                                    width: '20px', height: '20px', borderRadius: '50%', backgroundColor: preset,
                                    border: color === preset ? '2px solid white' : '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', transform: color === preset ? 'scale(1.1)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            />
                        ))}
                        {/* Custom color input picker */}
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            style={{
                                width: '22px', height: '22px', border: 'none', borderRadius: '50%',
                                backgroundColor: 'transparent', cursor: 'pointer', padding: 0
                            }}
                        />
                    </div>
                </form>

                {/* Statuses List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                    {statuses.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0', fontSize: '14px' }}>
                            Statü bulunmuyor.
                        </div>
                    ) : (
                        statuses.map((status, index) => (
                            <div key={status.id} style={{
                                backgroundColor: '#1A1D28', border: '1px solid var(--border-color)', borderRadius: '8px',
                                padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                gap: '8px'
                            }}>
                                {/* Left Content: Move Controls & Name */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                    {/* Order Buttons */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <button
                                            onClick={() => handleMove(index, 'up')}
                                            disabled={index === 0}
                                            style={{
                                                color: 'var(--text-secondary)', cursor: index === 0 ? 'not-allowed' : 'pointer',
                                                opacity: index === 0 ? 0.2 : 0.7, padding: '2px'
                                            }}
                                        >
                                            <ArrowUp size={12} />
                                        </button>
                                        <button
                                            onClick={() => handleMove(index, 'down')}
                                            disabled={index === statuses.length - 1}
                                            style={{
                                                color: 'var(--text-secondary)', cursor: index === statuses.length - 1 ? 'not-allowed' : 'pointer',
                                                opacity: index === statuses.length - 1 ? 0.2 : 0.7, padding: '2px'
                                            }}
                                        >
                                            <ArrowDown size={12} />
                                        </button>
                                    </div>

                                    {/* Color Indicator */}
                                    {editingId === status.id ? (
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <input
                                                type="color"
                                                value={editColor}
                                                onChange={(e) => setEditColor(e.target.value)}
                                                style={{ width: '22px', height: '22px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent' }}
                                            />
                                        </div>
                                    ) : (
                                        <span style={{
                                            width: '10px', height: '10px', borderRadius: '50%',
                                            backgroundColor: status.color, flexShrink: 0
                                        }}></span>
                                    )}

                                    {/* Editable Name */}
                                    {editingId === status.id ? (
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            style={{
                                                flex: 1, padding: '4px 8px', borderRadius: '4px',
                                                backgroundColor: 'var(--bg-color)', border: '1px solid var(--accent-purple)',
                                                color: 'white', fontSize: '13px', outline: 'none'
                                            }}
                                            autoFocus
                                        />
                                    ) : (
                                        <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'white' }}>
                                            {status.name}
                                        </span>
                                    )}
                                </div>

                                {/* Right Content: Action Buttons */}
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    {editingId === status.id ? (
                                        <>
                                            <button
                                                onClick={() => handleSaveEdit(status.id, status.name)}
                                                style={{ padding: '6px', color: 'var(--accent-purple)', cursor: 'pointer' }}
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                style={{ padding: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => startEdit(status)}
                                                style={{ padding: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(status)}
                                                style={{ padding: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
