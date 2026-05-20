'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Clock, Search, MessageSquare, Calendar, DollarSign, Globe, 
    User, Edit2, Trash2, Check, X, ChevronDown, ChevronUp, 
    Plus, Link as LinkIcon, Send, Settings
} from 'lucide-react';
import styles from './Home.module.css';
import PendingPaymentsModal from '@/components/PendingPaymentsModal';
import StatusesModal from '@/components/StatusesModal';
import { db } from '@/lib/firebase';
import { 
    collection, query, where, addDoc, deleteDoc, doc, 
    updateDoc, onSnapshot, writeBatch
} from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { DEFAULT_STATUSES_DATA, getStatusStyle } from '@/lib/statuses';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface FollowUpNote {
    text: string;
    createdAt: number;
    isSystem?: boolean;
}

interface FollowUp {
    id: string;
    youtuberId?: string;
    youtuberName: string;
    country: string;
    contactMethod: string;
    status: string;
    trialMod: string;
    paymentAmount: number;
    lastNote: string;
    lastUpdated: number;
    createdAt: number;
    notes: FollowUpNote[];
}

interface Youtuber {
    id: string;
    name: string;
    groupId: string;
    channelUrl?: string;
}

interface Group {
    id: string;
    name: string;
}

interface Status {
    id: string;
    name: string;
    color: string;
    order: number;
}

export default function HomePage() {
    const { user } = useAuth();
    
    // Core database collections
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [youtubers, setYoutubers] = useState<Youtuber[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);
    
    // UI state
    const [isPendingOpen, setIsPendingOpen] = useState(false);
    const [isStatusesOpen, setIsStatusesOpen] = useState(false);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('Tümü');
    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
    const [inlineNotes, setInlineNotes] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    
    // Form fields for Add Follow Up
    const [youtuberNameInput, setYoutuberNameInput] = useState('');
    const [selectedYoutuberId, setSelectedYoutuberId] = useState('');
    const [countryInput, setCountryInput] = useState('');
    const [contactMethodInput, setContactMethodInput] = useState('');
    const [trialModInput, setTrialModInput] = useState('');
    const [initialStatus, setInitialStatus] = useState('');
    const [paymentAmountInput, setPaymentAmountInput] = useState('');
    const [initialNoteInput, setInitialNoteInput] = useState('');
    
    // Dropdown search for existing Youtubers
    const [showYtDropdown, setShowYtDropdown] = useState(false);
    const [ytSearchQuery, setYtSearchQuery] = useState('');

    useEffect(() => {
        if (!user) return;

        // Listen to followups
        const qFollow = query(collection(db, "followups"), where("userId", "==", user.uid));
        const unsubFollow = onSnapshot(qFollow, (snapshot) => {
            const list: FollowUp[] = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as FollowUp));
            list.sort((a, b) => b.lastUpdated - a.lastUpdated);
            setFollowUps(list);
        });

        // Listen to youtubers catalog
        const qYoutubers = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsubYoutubers = onSnapshot(qYoutubers, (snapshot) => {
            const list: Youtuber[] = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Youtuber));
            setYoutubers(list);
        });

        // Listen to groups catalog for provision fallback
        const qGroups = query(collection(db, "groups"), where("userId", "==", user.uid));
        const unsubGroups = onSnapshot(qGroups, (snapshot) => {
            const list: Group[] = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Group));
            setGroups(list);
        });

        // Listen to custom statuses in Firestore with automatic seeding if empty
        const qStatuses = query(collection(db, "statuses"), where("userId", "==", user.uid));
        const unsubStatuses = onSnapshot(qStatuses, async (snapshot) => {
            if (snapshot.empty) {
                // Seed database with default 15 statuses using writeBatch
                const batch = writeBatch(db);
                DEFAULT_STATUSES_DATA.forEach((s) => {
                    const docRef = doc(collection(db, "statuses"));
                    batch.set(docRef, {
                        name: s.name,
                        color: s.color,
                        order: s.order,
                        userId: user.uid,
                        createdAt: Date.now()
                    });
                });
                try {
                    await batch.commit();
                } catch (err) {
                    console.error("Error seeding default statuses: ", err);
                }
                return;
            }

            const list: Status[] = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Status));
            // Sort by order ascending
            list.sort((a, b) => a.order - b.order);
            setStatuses(list);
            
            // Set initial status to first dynamic status
            if (list.length > 0) {
                setInitialStatus(list[0].name);
            }
        });

        return () => {
            unsubFollow();
            unsubYoutubers();
            unsubGroups();
            unsubStatuses();
        };
    }, [user]);

    // Close YouTuber autocomplete dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const container = document.getElementById('youtuber-search-container');
            if (container && !container.contains(event.target as Node)) {
                setShowYtDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Filtered Youtubers for the creation dropdown search
    const filteredYoutubers = useMemo(() => {
        if (!ytSearchQuery.trim()) return youtubers;
        return youtubers.filter(yt => 
            yt.name.toLowerCase().includes(ytSearchQuery.toLowerCase())
        );
    }, [ytSearchQuery, youtubers]);

    // Filtered & Searched Follow Ups
    const filteredFollowUps = useMemo(() => {
        return followUps.filter(f => {
            const nameMatch = f.youtuberName.toLowerCase().includes(searchQuery.toLowerCase());
            const statusMatch = activeFilter === 'Tümü' || f.status === activeFilter;
            return nameMatch && statusMatch;
        });
    }, [followUps, searchQuery, activeFilter]);

    // Grouped Follow Ups when in "Tümü" filter
    const groupedFollowUps = useMemo(() => {
        if (activeFilter !== 'Tümü') return null;
        
        const groups: Record<string, FollowUp[]> = {};
        filteredFollowUps.forEach(f => {
            if (!groups[f.status]) groups[f.status] = [];
            groups[f.status].push(f);
        });
        
        // Group by loaded database statuses
        return statuses.map(s => ({
            status: s.name,
            color: s.color,
            items: groups[s.name] || []
        })).filter(g => g.items.length > 0);
    }, [filteredFollowUps, activeFilter, statuses]);

    const handleSelectYoutuber = (yt: Youtuber) => {
        setYoutuberNameInput(yt.name);
        setSelectedYoutuberId(yt.id);
        setShowYtDropdown(false);
        setYtSearchQuery('');
    };

    const handleAddFollowUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedYoutuberId) return;

        setLoading(true);

        try {
            const initialSystemNote: FollowUpNote = {
                text: "Takip kaydı oluşturuldu.",
                createdAt: Date.now(),
                isSystem: true
            };
            const initialNotes: FollowUpNote[] = [initialSystemNote];
            let lastNoteText = "Takip kaydı oluşturuldu.";

            if (initialNoteInput.trim()) {
                initialNotes.push({
                    text: initialNoteInput.trim(),
                    createdAt: Date.now()
                });
                lastNoteText = initialNoteInput.trim();
            }

            await addDoc(collection(db, "followups"), {
                youtuberId: selectedYoutuberId,
                youtuberName: youtuberNameInput,
                country: "-",
                contactMethod: "-",
                status: initialStatus || (statuses[0]?.name || 'Trial Mod Sent'),
                trialMod: "-",
                paymentAmount: 0,
                notes: initialNotes,
                lastNote: lastNoteText,
                lastUpdated: Date.now(),
                createdAt: Date.now(),
                userId: user.uid
            });

            // Reset Form and close
            setIsAddOpen(false);
            setYoutuberNameInput('');
            setSelectedYoutuberId('');
            setYtSearchQuery('');
            setInitialStatus(statuses[0]?.name || 'Trial Mod Sent');
            setInitialNoteInput('');
        } catch (err) {
            console.error("Error adding follow-up:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Bu takip kaydını silmek istediğinize emin misiniz?")) {
            try {
                await deleteDoc(doc(db, "followups", id));
            } catch (err) {
                console.error("Error deleting follow-up:", err);
            }
        }
    };

    const handleQuickNote = async (id: string, currentNotes: FollowUpNote[]) => {
        const text = inlineNotes[id]?.trim();
        if (!text) return;

        try {
            const newNote: FollowUpNote = {
                text,
                createdAt: Date.now()
            };
            await updateDoc(doc(db, "followups", id), {
                notes: [...(currentNotes || []), newNote],
                lastNote: text,
                lastUpdated: Date.now()
            });
            // Clear input for this card
            setInlineNotes(prev => ({ ...prev, [id]: '' }));
        } catch (err) {
            console.error("Error adding note:", err);
        }
    };

    const handleQuickStatusChange = async (id: string, oldStatus: string, newStatus: string, currentNotes: FollowUpNote[]) => {
        if (oldStatus === newStatus) return;
        try {
            const systemNote: FollowUpNote = {
                text: `Durum "${oldStatus}" aşamasından "${newStatus}" aşamasına güncellendi.`,
                createdAt: Date.now(),
                isSystem: true
            };
            await updateDoc(doc(db, "followups", id), {
                status: newStatus,
                notes: [...(currentNotes || []), systemNote],
                lastNote: systemNote.text,
                lastUpdated: Date.now()
            });
        } catch (err) {
            console.error("Error changing status:", err);
        }
    };

    const toggleCard = (id: string) => {
        setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const triggerAddNoteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedCards(prev => ({ ...prev, [id]: true }));
        // Set brief timeout to focus input
        setTimeout(() => {
            const input = document.getElementById(`quick-note-input-${id}`);
            if (input) input.focus();
        }, 100);
    };

    return (
        <div className={styles.container}>
            {/* Header row */}
            <div className={styles.headerRow}>
                <div>
                    <h1 className="page-title">Follow Ups</h1>
                    <p className="page-subtitle">Track trial mod recipients, active customers, old customers, and pending payments.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => setIsStatusesOpen(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500,
                            cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                    >
                        <Settings size={14} /> Statüleri Yönet
                    </button>
                    <button
                        onClick={() => setIsPendingOpen(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            backgroundColor: 'rgba(92, 62, 240, 0.15)', border: '1px solid var(--accent-purple)',
                            color: 'var(--accent-purple)', fontSize: '13px', fontWeight: 500,
                            cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                    >
                        <Clock size={14} /> Beklenen Ödemeler
                    </button>
                </div>
            </div>

            {/* Top Summaries completely removed as requested */}

            {/* Search, Add, and filter row */}
            <div className={styles.searchFilterRow}>
                <div className={styles.searchAddContainer}>
                    <div className={styles.searchInputWrapper}>
                        <Search size={16} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="YouTuber ismine göre ara..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>
                    <button
                        className={styles.addNewBtn}
                        onClick={() => {
                            if (statuses.length > 0) {
                                setInitialStatus(statuses[0].name);
                            } else {
                                setInitialStatus('Trial Mod Sent');
                            }
                            setIsAddOpen(true);
                        }}
                    >
                        <Plus size={16} /> Yeni Ekle
                    </button>
                </div>

                <div className={styles.filterSelectWrapper}>
                    <span className={styles.filterLabel}>Durum Filtresi:</span>
                    <select
                        value={activeFilter}
                        onChange={(e) => setActiveFilter(e.target.value)}
                        className={styles.filterSelect}
                    >
                        <option value="Tümü">Tümü ({followUps.length})</option>
                        {statuses.map(s => {
                            const count = followUps.filter(f => f.status === s.name).length;
                            return (
                                <option key={s.id} value={s.name}>
                                    {s.name} ({count})
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>

            {/* List area */}
            <div className={styles.followUpsGrid}>
                {filteredFollowUps.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0', border: '1px dashed var(--border-color)', borderRadius: '16px' }}>
                        Gösterilecek takip kaydı bulunamadı.
                    </div>
                )}

                {/* Grouped view when looking at "Tümü" */}
                {activeFilter === 'Tümü' && groupedFollowUps && groupedFollowUps.map(group => (
                    <div key={group.status} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', paddingLeft: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: group.color }}></span>
                            {group.status} ({group.items.length})
                        </div>
                        {group.items.map(f => renderFollowUpCard(f))}
                    </div>
                ))}

                {/* Flat view when filtered */}
                {activeFilter !== 'Tümü' && filteredFollowUps.map(f => renderFollowUpCard(f))}
            </div>

            {/* Add Follow Up Modal */}
            {isAddOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ width: '480px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Yeni Takip Ekle</h2>
                            <button onClick={() => {
                                setIsAddOpen(false);
                                setSelectedYoutuberId('');
                                setYoutuberNameInput('');
                                setYtSearchQuery('');
                                setInitialNoteInput('');
                            }} style={{ color: 'var(--text-secondary)', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddFollowUp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>YouTuber / Müşteri</label>
                                {selectedYoutuberId ? (
                                    <div className={styles.selectedYoutuberBadge}>
                                        <div className={styles.selectedYtInfo}>
                                            <User size={16} className={styles.selectedYtIcon} />
                                            <span className={styles.selectedYtName}>{youtuberNameInput}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedYoutuberId('');
                                                setYoutuberNameInput('');
                                            }}
                                            className={styles.clearSelectedYt}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div id="youtuber-search-container" className={styles.searchSelectContainer}>
                                        <input
                                            type="text"
                                            placeholder="YouTuber seçmek için arayın..."
                                            value={ytSearchQuery}
                                            onChange={(e) => {
                                                setYtSearchQuery(e.target.value);
                                                setShowYtDropdown(true);
                                            }}
                                            onFocus={() => setShowYtDropdown(true)}
                                            className={styles.formInput}
                                            required={!selectedYoutuberId}
                                        />
                                        {showYtDropdown && (
                                            <div className={styles.searchSelectDropdown}>
                                                {filteredYoutubers.map(yt => (
                                                    <div
                                                        key={yt.id}
                                                        onClick={() => handleSelectYoutuber(yt)}
                                                        className={styles.searchSelectItem}
                                                    >
                                                        {yt.name}
                                                    </div>
                                                ))}
                                                {filteredYoutubers.length === 0 && (
                                                    <div className={styles.searchSelectItemEmpty}>
                                                        Eşleşen YouTuber bulunamadı.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Aşama (Status)</label>
                                <select
                                    value={initialStatus}
                                    onChange={(e) => setInitialStatus(e.target.value)}
                                    className={styles.formSelect}
                                >
                                    {statuses.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>İlk Not (Opsiyonel)</label>
                                <textarea
                                    placeholder="YouTuber hakkında ilk gözleminiz veya detaylar..."
                                    value={initialNoteInput}
                                    onChange={(e) => setInitialNoteInput(e.target.value)}
                                    className={styles.formTextarea}
                                    rows={3}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={loading || !selectedYoutuberId}
                                style={{ marginTop: '8px' }}
                            >
                                {loading ? 'Oluşturuluyor...' : 'Takip Başlat'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Dynamic Statuses Manager Panel Modal */}
            <StatusesModal
                isOpen={isStatusesOpen}
                onClose={() => setIsStatusesOpen(false)}
                statuses={statuses}
                followUps={followUps}
            />

            {/* Pending Payments Modal */}
            <PendingPaymentsModal
                isOpen={isPendingOpen}
                onClose={() => setIsPendingOpen(false)}
            />
        </div>
    );

    // Render helper for single Follow Up card
    function renderFollowUpCard(f: FollowUp) {
        // Dynamic status color lookup from database state
        const statusObj = statuses.find(s => s.name === f.status);
        const statusColor = statusObj ? statusObj.color : '#5C3EF0';
        const statusColors = getStatusStyle(statusColor);
        
        const isExpanded = expandedCards[f.id] || false;
        
        // Lookup YouTuber from catalog
        const ytData = youtubers.find(y => y.id === f.youtuberId);
        const groupData = ytData ? groups.find(g => g.id === ytData.groupId) : null;

        const displayName = ytData ? ytData.name : f.youtuberName;
        const displayCountry = groupData ? groupData.name : f.country;
        const displayChannelUrl = ytData?.channelUrl || null;
        
        return (
            <div key={f.id} className={styles.followUpCard}>
                {/* Left boundary bar color based on status color */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px',
                    backgroundColor: statusColor
                }}></div>

                <div className={styles.cardTopRow}>
                    <div className={styles.cardHeaderInfo}>
                        <div className={styles.youtuberName}>
                            <User size={16} style={{ color: 'var(--text-secondary)' }} />
                            {displayName}
                        </div>
                        
                        <div className={styles.badgeRow}>
                            {displayCountry && displayCountry !== '-' && (
                                <span className={styles.metaBadge}>
                                    <Globe size={11} /> {displayCountry}
                                </span>
                            )}
                            {displayChannelUrl ? (
                                <a 
                                    href={displayChannelUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.metaBadgeLink}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <LinkIcon size={11} /> Kanalı Aç
                                </a>
                            ) : (
                                f.contactMethod && f.contactMethod !== '-' && (
                                    <span className={styles.metaBadge}>
                                        <MessageSquare size={11} /> {f.contactMethod}
                                    </span>
                                )
                            )}
                            <span 
                                className={styles.statusPill}
                                style={{
                                    backgroundColor: statusColors.bg,
                                    color: statusColors.text,
                                    border: statusColors.border
                                }}
                            >
                                {f.status}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                            value={f.status}
                            onChange={(e) => handleQuickStatusChange(f.id, f.status, e.target.value, f.notes)}
                            className={styles.statusInlineSelect}
                        >
                            {statuses.map(s => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                        <button 
                            onClick={(e) => handleDelete(e, f.id)} 
                            style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex', backgroundColor: 'rgba(229, 57, 53, 0.08)' }}
                        >
                            <Trash2 size={13} style={{ color: 'var(--accent-red)' }} />
                        </button>
                    </div>
                </div>

                {f.lastNote && (
                    <div className={styles.lastNotePreview}>
                        <strong>Son Not: </strong> {f.lastNote}
                    </div>
                )}

                {/* Card Actions */}
                <div className={styles.cardActions}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                        Güncelleme: {format(new Date(f.lastUpdated), 'd MMM yyyy HH:mm', { locale: tr })}
                    </div>

                    <div className={styles.actionBtnLeft}>
                        <button className={styles.btnAction} onClick={(e) => triggerAddNoteClick(e, f.id)}>
                            Not Ekle
                        </button>
                        <button className={styles.btnActionPrimary} onClick={() => toggleCard(f.id)}>
                            {isExpanded ? (
                                <>Kapat <ChevronUp size={14} /></>
                            ) : (
                                <>Aç / Geçmiş <ChevronDown size={14} /></>
                            )}
                        </button>
                    </div>
                </div>

                {/* Expanded Notes Section */}
                {isExpanded && (
                    <div className={styles.expandedSection}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                            Not Geçmişi ({f.notes?.length || 0})
                        </div>

                        <div className={styles.notesTimeline}>
                            {(!f.notes || f.notes.length === 0) ? (
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px 0' }}>Not bulunmuyor.</p>
                            ) : (
                                f.notes.map((note, index) => (
                                    <div key={index} className={`${styles.timelineItem} ${note.isSystem ? styles.system : ''}`}>
                                        <p className={styles.timelineText}>
                                            {note.text}
                                        </p>
                                        <div className={styles.timelineMeta}>
                                            <span>{note.isSystem ? 'Sistem Logu' : 'Kullanıcı'}</span>
                                            <span>
                                                {format(new Date(note.createdAt), 'd MMM yyyy HH:mm', { locale: tr })}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className={styles.quickNoteForm} onClick={(e) => e.stopPropagation()}>
                            <input
                                id={`quick-note-input-${f.id}`}
                                type="text"
                                placeholder="Buraya yeni bir not yazın..."
                                value={inlineNotes[f.id] || ''}
                                onChange={(e) => setInlineNotes(prev => ({ ...prev, [f.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && handleQuickNote(f.id, f.notes)}
                                className={styles.quickNoteInput}
                            />
                            <button className={styles.quickNoteBtn} onClick={() => handleQuickNote(f.id, f.notes)}>
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
