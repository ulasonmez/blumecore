'use client';

import { useState, useEffect } from 'react';
import { Trash2, Edit2, Check, X, UserPlus } from 'lucide-react';
import styles from './Team.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import BrokerModal from '@/components/BrokerModal';

interface TeamMember {
    id: string;
    name: string;
    role?: 'member' | 'broker';
}

export default function TeamPage() {
    const { user } = useAuth();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState<'member' | 'broker'>('member');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "team"), where("userId", "==", user.uid));
        const unsub = onSnapshot(q, (snapshot) => {
            const data: TeamMember[] = [];
            snapshot.forEach(doc => {
                const docData = doc.data();
                data.push({
                    id: doc.id,
                    name: docData.name,
                    role: docData.role || 'member'
                });
            });
            setMembers(data);
        });
        return () => unsub();
    }, [user]);

    const handleAdd = async () => {
        if (!newName.trim() || !user) return;
        try {
            await addDoc(collection(db, "team"), {
                name: newName.trim(),
                role: newRole,
                userId: user.uid,
                createdAt: new Date()
            });
            setNewName('');
        } catch (e) {
            console.error("Error adding team member:", e);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Bu kişiyi silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, "team", id));
            } catch (e) {
                console.error("Error deleting team member:", e);
            }
        }
    };

    const handleStartEdit = (member: TeamMember) => {
        setEditingId(member.id);
        setEditName(member.name);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editName.trim()) return;
        try {
            await updateDoc(doc(db, "team", editingId), { name: editName.trim() });
            setEditingId(null);
            setEditName('');
        } catch (e) {
            console.error("Error updating team member:", e);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    const [selectedBroker, setSelectedBroker] = useState<TeamMember | null>(null);

    const teamMembers = members.filter(m => m.role === 'member' || !m.role);
    const brokers = members.filter(m => m.role === 'broker');

    const renderMemberCard = (member: TeamMember) => (
        <div
            key={member.id}
            className={styles.memberCard}
            onClick={() => {
                if (member.role === 'broker' && editingId !== member.id) {
                    setSelectedBroker(member);
                }
            }}
            style={{ cursor: member.role === 'broker' ? 'pointer' : 'default' }}
        >
            {editingId === member.id ? (
                <input
                    type="text"
                    className={styles.editInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className={styles.memberName}>{member.name}</span>
            )}

            <div className={styles.memberActions}>
                {editingId === member.id ? (
                    <>
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}>
                            <Check size={18} color="var(--accent-purple)" />
                        </button>
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}>
                            <X size={18} />
                        </button>
                    </>
                ) : (
                    <>
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleStartEdit(member); }}>
                            <Edit2 size={16} />
                        </button>
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleDelete(member.id); }}>
                            <Trash2 size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className={styles.container}>
            <h1 className="page-title">Team</h1>
            <p className="page-subtitle">Ekip üyelerinizi yönetin</p>

            <div className={styles.addInputWrapper} style={{ flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <input
                        type="text"
                        placeholder={newRole === 'member' ? "Yeni üye ekle" : "Yeni aracı ekle"}
                        className={styles.addInput}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        className="btn-primary"
                        style={{ padding: '0 24px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={handleAdd}
                        disabled={!newName.trim()}
                    >
                        <UserPlus size={16} /> Ekle
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                        className={styles.filterBadge}
                        style={{
                            flex: 1,
                            backgroundColor: newRole === 'member' ? 'rgba(92, 62, 240, 0.15)' : 'var(--bg-color)',
                            borderColor: newRole === 'member' ? 'var(--accent-purple)' : 'var(--border-color)',
                            color: newRole === 'member' ? 'var(--accent-purple)' : 'var(--text-secondary)'
                        }}
                        onClick={() => setNewRole('member')}
                    >
                        Ekip Üyesi
                    </button>
                    <button
                        className={styles.filterBadge}
                        style={{
                            flex: 1,
                            backgroundColor: newRole === 'broker' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-color)',
                            borderColor: newRole === 'broker' ? '#3B82F6' : 'var(--border-color)',
                            color: newRole === 'broker' ? '#3B82F6' : 'var(--text-secondary)'
                        }}
                        onClick={() => setNewRole('broker')}
                    >
                        Aracı
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px', marginTop: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                        Ekip Üyeleri
                    </h2>
                    {teamMembers.length === 0 ? (
                        <div className={styles.emptyState} style={{ padding: '20px 0' }}>Ekip üyesi yok.</div>
                    ) : (
                        teamMembers.map(renderMemberCard)
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#3B82F6', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                        Aracılar
                    </h2>
                    {brokers.length === 0 ? (
                        <div className={styles.emptyState} style={{ padding: '20px 0' }}>Aracı yok.</div>
                    ) : (
                        brokers.map(renderMemberCard)
                    )}
                </div>
            </div>

            {selectedBroker && (
                <BrokerModal
                    isOpen={!!selectedBroker}
                    onClose={() => setSelectedBroker(null)}
                    brokerId={selectedBroker.id}
                    brokerName={selectedBroker.name}
                />
            )}
        </div>
    );
}
