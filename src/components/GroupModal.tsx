import React, { useState } from 'react';
import { X, Edit2, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, updateDoc, doc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import styles from './GroupModal.module.css';

interface Group {
    id: string;
    name: string;
    color: string;
}

interface GroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    groups: Group[];
}

const COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
    '#3B82F6', '#8B5CF6', '#D946EF', '#F43F5E', '#64748B'
];

export default function GroupModal({ isOpen, onClose, groups }: GroupModalProps) {
    const { user } = useAuth();
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedColor, setSelectedColor] = useState(COLORS[6]); // default purple

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    if (!isOpen) return null;

    const handleAddGroup = async () => {
        if (!user || !newGroupName.trim()) return;

        try {
            await addDoc(collection(db, "groups"), {
                name: newGroupName.trim(),
                color: selectedColor,
                userId: user.uid,
                createdAt: new Date()
            });
            setNewGroupName('');
        } catch (e) {
            console.error("Error adding group:", e);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Bu grubu silmek istediğinize emin misiniz? Altındaki Youtuberlar silinmeyecektir, ancak referansları bozulabilir.")) {
            try {
                await deleteDoc(doc(db, "groups", id));
            } catch (error) {
                console.error("Error deleting group:", error);
            }
        }
    };

    const startEditing = (group: Group) => {
        setEditingId(group.id);
        setEditName(group.name);
    };

    const saveEdit = async (id: string) => {
        if (!editName.trim()) {
            setEditingId(null);
            return;
        }
        try {
            await updateDoc(doc(db, "groups", id), {
                name: editName.trim()
            });
            setEditingId(null);
        } catch (error) {
            console.error("Error updating group:", error);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Grupları Yönet</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.addSection}>
                    <div className={styles.inputRow}>
                        <input
                            type="text"
                            placeholder="Yeni grup adı"
                            className={styles.input}
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                        />
                        <button className={styles.addBtn} onClick={handleAddGroup} disabled={!newGroupName.trim()}>
                            Ekle
                        </button>
                    </div>

                    <div className={styles.colorPicker}>
                        {COLORS.map((c) => (
                            <div
                                key={c}
                                className={`${styles.colorCircle} ${selectedColor === c ? styles.colorSelected : ''}`}
                                style={{ backgroundColor: c }}
                                onClick={() => setSelectedColor(c)}
                            />
                        ))}
                    </div>
                </div>

                <div className={styles.listSection}>
                    {groups.map((group) => (
                        <div key={group.id} className={styles.groupItem}>
                            <div className={styles.groupInfo}>
                                <span className={styles.groupDot} style={{ backgroundColor: group.color }}></span>
                                {editingId === group.id ? (
                                    <input
                                        type="text"
                                        className={styles.editInput}
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onBlur={() => saveEdit(group.id)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(group.id)}
                                        autoFocus
                                    />
                                ) : (
                                    <span className={styles.groupName}>{group.name}</span>
                                )}
                            </div>
                            <div className={styles.actions}>
                                <button className={styles.actionBtn} onClick={() => startEditing(group)}>
                                    <Edit2 size={16} />
                                </button>
                                <button className={styles.actionBtn} onClick={() => handleDelete(group.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {groups.length === 0 && (
                        <div className={styles.emptyText}>Henüz bir grup yok.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
