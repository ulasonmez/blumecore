'use client';

import { useState, useEffect } from 'react';
import { Trash2, Calendar as CalendarIcon, Link as LinkIcon } from 'lucide-react';
import styles from './Catalog.module.css';
import CalendarModal from '@/components/CalendarModal';
import GroupModal from '@/components/GroupModal';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface Group {
    id: string;
    name: string;
    color: string;
}

interface Youtuber {
    id: string;
    name: string;
    groupId: string;
    channelUrl?: string;
}

export default function CatalogPage() {
    const { user } = useAuth();
    const [groups, setGroups] = useState<Group[]>([]);
    const [items, setItems] = useState<Youtuber[]>([]);

    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [newChannelUrl, setNewChannelUrl] = useState('');

    // Modal state
    const [selectedItem, setSelectedItem] = useState<{ id: string, name: string, channelUrl?: string } | null>(null);

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    useEffect(() => {
        if (!user) return;

        const qGroups = query(collection(db, "groups"), where("userId", "==", user.uid));
        const unsubGroups = onSnapshot(qGroups, (snapshot) => {
            const grps: Group[] = [];
            snapshot.forEach(doc => grps.push({ id: doc.id, ...doc.data() } as Group));
            setGroups(grps);
        });

        const qItems = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsubItems = onSnapshot(qItems, (snapshot) => {
            const itms: Youtuber[] = [];
            snapshot.forEach(doc => itms.push({ id: doc.id, ...doc.data() } as Youtuber));
            setItems(itms);
        });

        return () => {
            unsubGroups();
            unsubItems();
        };
    }, [user]);

    // handleAddGroup logic is now moved to the new modal
    // we keep handleAdd for the Youtuber

    const handleAdd = async () => {
        if (!newItemName.trim() || !user) return;
        if (!activeGroup) {
            alert("Lütfen kişi eklemek için önce yukarıdaki menüden bir grup seçin (Tümü hariç).");
            return;
        }

        try {
            await addDoc(collection(db, "youtubers"), {
                name: newItemName.trim(),
                groupId: activeGroup,
                channelUrl: newChannelUrl.trim() || null,
                userId: user.uid,
                createdAt: new Date()
            });
            setNewItemName('');
            setNewChannelUrl('');
        } catch (e) {
            console.error("Error adding youtuber:", e);
        }
    };

    const handleDeleteYoutuber = async (e: React.MouseEvent, youtuberId: string) => {
        e.stopPropagation();
        if (confirm("Bu kayıt silinecek, emin misiniz?")) {
            try {
                await deleteDoc(doc(db, "youtubers", youtuberId));
            } catch (err) {
                console.error("Error deleting youtuber:", err);
            }
        }
    };

    const handleItemClick = (item: { id: string, name: string, channelUrl?: string }) => {
        setSelectedItem(item);
    };

    // Filter items if a specific group is clicked
    const itemsToDisplay = activeGroup
        ? items.filter((item) => item.groupId === activeGroup)
        : items;

    // Group items for display
    const groupedItems = groups.map((group) => {
        return {
            ...group,
            items: itemsToDisplay.filter((item) => item.groupId === group.id),
        };
    }).filter((g) => g.items.length > 0);

    return (
        <div style={{ paddingBottom: '20px' }}>
            <div className={styles.headerRow}>
                <div>
                    <h1 className="page-title">YouTubers</h1>
                    <p className="page-subtitle">Rutin öğelerinizi yönetin</p>
                </div>
                <button className={styles.manageGroupsBtn} onClick={() => setIsGroupModalOpen(true)}>Grupları Yönet</button>
            </div>

            <div className={styles.addInputWrapper} style={{ flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <input
                        type="text"
                        placeholder="Yeni youtuber ekle (Grup seçerek)"
                        className={styles.addInput}
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                    />
                    <button
                        className="btn-primary"
                        style={{ padding: '0 24px', whiteSpace: 'nowrap' }}
                        onClick={handleAdd}
                        disabled={!newItemName.trim()}
                    >
                        Ekle
                    </button>
                </div>
                <div style={{ position: 'relative', width: '100%' }}>
                    <LinkIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        placeholder="Kanal Linki (Opsiyonel)"
                        className={styles.addInput}
                        style={{ paddingLeft: '36px', width: '100%' }}
                        value={newChannelUrl}
                        onChange={(e) => setNewChannelUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                </div>
            </div>

            <div className={styles.filterScroll}>
                <button
                    className={`${styles.filterBadge} ${activeGroup === null ? styles.active : ''}`}
                    onClick={() => setActiveGroup(null)}
                >
                    <span className={styles.dot} style={{ backgroundColor: '#5C3EF0' }}></span>
                    Tümü
                </button>
                {groups.map((group) => (
                    <button
                        key={group.id}
                        className={`${styles.filterBadge} ${activeGroup === group.id ? styles.active : ''}`}
                        onClick={() => setActiveGroup(group.id)}
                    >
                        <span className={styles.dot} style={{ backgroundColor: group.color }}></span>
                        {group.name}
                    </button>
                ))}
            </div>

            <div className="catalog-list">
                {groupedItems.length === 0 && (
                    <div style={{ textAlign: 'center', margin: '40px 0', color: 'var(--text-secondary)' }}>
                        Henüz gösterilecek kayıt yok. Önce yukarıdan bir grup ekleyin!
                    </div>
                )}
                {groupedItems.map((group) => (
                    <div key={group.id}>
                        <div className={styles.groupHeader}>
                            <span className={styles.dot} style={{ backgroundColor: group.color }}></span>
                            {group.name}
                        </div>

                        <div className={styles.itemsWrapper}>
                            {group.items.map((item) => (
                                <div key={item.id} className={styles.itemCard} onClick={() => handleItemClick(item)}>
                                    <div className={styles.itemContent}>
                                        <div className={styles.itemColorBar} style={{ backgroundColor: group.color }}></div>
                                        <span className={styles.itemName}>{item.name}</span>
                                    </div>
                                    <div className={styles.itemIcon} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <CalendarIcon size={18} />
                                        <button
                                            onClick={(e) => handleDeleteYoutuber(e, item.id)}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {selectedItem && (
                <CalendarModal
                    isOpen={!!selectedItem}
                    onClose={() => setSelectedItem(null)}
                    youtuberId={selectedItem.id}
                    title={selectedItem.name}
                    channelUrl={selectedItem.channelUrl}
                />
            )}

            <GroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                groups={groups}
            />
        </div>
    );
}
