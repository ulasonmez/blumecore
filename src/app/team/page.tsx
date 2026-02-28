'use client';

import { useState, useEffect } from 'react';
import { Trash2, Edit2, Check, X, UserPlus } from 'lucide-react';
import styles from './Team.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface TeamMember {
    id: string;
    name: string;
}

export default function TeamPage() {
    const { user } = useAuth();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "team"), where("userId", "==", user.uid));
        const unsub = onSnapshot(q, (snapshot) => {
            const data: TeamMember[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setMembers(data);
        });
        return () => unsub();
    }, [user]);

    const handleAdd = async () => {
        if (!newName.trim() || !user) return;
        try {
            await addDoc(collection(db, "team"), {
                name: newName.trim(),
                userId: user.uid,
                createdAt: new Date()
            });
            setNewName('');
        } catch (e) {
            console.error("Error adding team member:", e);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Bu ekip üyesini silmek istediğinize emin misiniz?")) {
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

    return (
        <div className={styles.container}>
            <h1 className="page-title">Team</h1>
            <p className="page-subtitle">Ekip üyelerinizi yönetin</p>

            <div className={styles.addInputWrapper}>
                <input
                    type="text"
                    placeholder="Yeni üye ekle"
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

            {members.length === 0 ? (
                <div className={styles.emptyState}>
                    Henüz ekip üyesi eklenmemiş.
                </div>
            ) : (
                members.map(member => (
                    <div key={member.id} className={styles.memberCard}>
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
                            />
                        ) : (
                            <span className={styles.memberName}>{member.name}</span>
                        )}

                        <div className={styles.memberActions}>
                            {editingId === member.id ? (
                                <>
                                    <button className={styles.actionBtn} onClick={handleSaveEdit}>
                                        <Check size={18} color="var(--accent-purple)" />
                                    </button>
                                    <button className={styles.actionBtn} onClick={handleCancelEdit}>
                                        <X size={18} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className={styles.actionBtn} onClick={() => handleStartEdit(member)}>
                                        <Edit2 size={16} />
                                    </button>
                                    <button className={styles.actionBtn} onClick={() => handleDelete(member.id)}>
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
