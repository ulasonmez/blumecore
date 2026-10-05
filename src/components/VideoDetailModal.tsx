'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    ExternalLink,
    Calendar,
    Users,
    Handshake,
    FileText,
    Video as VideoIcon,
    Box,
    Plus,
    Trash2,
    Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './VideoDetailModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { authenticatedFetch } from '@/lib/api-client';
import { ModProject, YoutuberModAccess } from '@/lib/mods/types';
import ModModal from './ModModal';
import YoutuberModAccessModal from './YoutuberModAccessModal';

interface YoutuberAssignment {
    id: string;
    youtuberId: string;
    name: string;
    delivered?: boolean;
    note: string;
    videoId: string;
    createdAt?: number;
    brokerId?: string;
}

interface VideoDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    video: {
        id: string;
        url: string;
        title: string;
    };
    assignments: YoutuberAssignment[];
}

export default function VideoDetailModal({
    isOpen,
    onClose,
    video,
    assignments
}: VideoDetailModalProps) {
    const { user } = useAuth();
    const [brokers, setBrokers] = useState<Record<string, string>>({});

    // Mod linking state
    const [linkedMods, setLinkedMods] = useState<(ModProject & { linkId: string })[]>([]);
    const [allMods, setAllMods] = useState<ModProject[]>([]);
    const [isLinkDropdownOpen, setIsLinkDropdownOpen] = useState(false);
    const [modSearchTerm, setModSearchTerm] = useState('');
    const [isLinkingMod, setIsLinkingMod] = useState(false);
    const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

    // Access map: `modId_youtuberId` -> YoutuberModAccess
    const [accessMap, setAccessMap] = useState<Record<string, YoutuberModAccess>>({});
    const [playerCountMap, setPlayerCountMap] = useState<Record<string, number>>({});

    // Managing access modal state
    const [managingTarget, setManagingTarget] = useState<{
        mod: ModProject;
        youtuberId: string;
        youtuberName: string;
    } | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    // Fetch Brokers
    useEffect(() => {
        if (!isOpen || !user) return;
        const qBrokers = query(
            collection(db, "team"),
            where("userId", "==", user.uid),
            where("role", "==", "broker")
        );
        const unsub = onSnapshot(qBrokers, (snapshot) => {
            const map: Record<string, string> = {};
            snapshot.forEach(doc => {
                map[doc.id] = doc.data().name;
            });
            setBrokers(map);
        });
        return () => unsub();
    }, [isOpen, user]);

    // Fetch All User Mods
    useEffect(() => {
        if (!isOpen || !user) return;
        const qMods = query(collection(db, "mod_projects"), where("userId", "==", user.uid));
        const unsub = onSnapshot(qMods, (snapshot) => {
            const list: ModProject[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...(doc.data() as Omit<ModProject, 'id'>) });
            });
            setAllMods(list);
        });
        return () => unsub();
    }, [isOpen, user]);

    // Fetch Linked Mods for this Video
    const loadLinkedMods = async () => {
        if (!isOpen || !user || !video.id) return;
        try {
            const res = await authenticatedFetch(`/api/videos/${video.id}/mods`);
            const json = await res.json();
            if (json.data) {
                setLinkedMods(json.data);
            }
        } catch (e) {
            console.error('Error loading video mods:', e);
        }
    };

    useEffect(() => {
        loadLinkedMods();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, user, video.id]);

    // Subscribe to YoutuberModAccess records
    useEffect(() => {
        if (!isOpen || !user) return;
        const qAccess = query(collection(db, "youtuber_mod_access"), where("userId", "==", user.uid));
        const unsub = onSnapshot(qAccess, (snapshot) => {
            const map: Record<string, YoutuberModAccess> = {};
            snapshot.forEach(doc => {
                const data = doc.data() as Omit<YoutuberModAccess, 'id'>;
                map[`${data.modProjectId}_${data.youtuberId}`] = { id: doc.id, ...data };
            });
            setAccessMap(map);
        });
        return () => unsub();
    }, [isOpen, user]);

    // Subscribe to active player counts per youtuber
    useEffect(() => {
        if (!isOpen || !user) return;
        const qPlayers = query(
            collection(db, "youtuber_minecraft_players"),
            where("userId", "==", user.uid),
            where("isActive", "==", true)
        );
        const unsub = onSnapshot(qPlayers, (snapshot) => {
            const counts: Record<string, number> = {};
            snapshot.forEach(doc => {
                const yId = doc.data().youtuberId;
                counts[yId] = (counts[yId] || 0) + 1;
            });
            setPlayerCountMap(counts);
        });
        return () => unsub();
    }, [isOpen, user]);

    // Link a mod to this video
    const handleLinkMod = async (modId: string) => {
        if (!user || isLinkingMod) return;
        setIsLinkingMod(true);
        try {
            const res = await authenticatedFetch(`/api/videos/${video.id}/mods`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ modProjectId: modId })
            });
            if (res.ok) {
                setIsLinkDropdownOpen(false);
                setModSearchTerm('');
                loadLinkedMods();
            } else {
                const json = await res.json();
                alert(json.error || 'Mod bağlanırken hata oluştu.');
            }
        } catch {
            alert('Ağ hatası.');
        } finally {
            setIsLinkingMod(false);
        }
    };

    // Unlink mod from this video
    const handleUnlinkMod = async (modId: string) => {
        if (!user) return;
        if (!confirm('Bu modun video bağlantısını kaldırmak istediğinize emin misiniz? (YouTuber erişimleri silinmeyecektir).')) return;
        try {
            const res = await authenticatedFetch(`/api/videos/${video.id}/mods/${modId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                loadLinkedMods();
            }
        } catch (e) {
            console.error('Error unlinking mod:', e);
        }
    };

    if (!isOpen || typeof document === 'undefined') return null;

    const availableModsToLink = allMods.filter(
        (m) => !linkedMods.some((lm) => lm.id === m.id) &&
            (m.displayName.toLowerCase().includes(modSearchTerm.toLowerCase()) ||
                m.modKey.toLowerCase().includes(modSearchTerm.toLowerCase()))
    );

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.topRow}>
                        <span className={styles.badgeTag}>
                            <VideoIcon size={12} />
                            Video Detayı
                        </span>
                        <button
                            className={styles.closeBtn}
                            onClick={onClose}
                            aria-label="Kapat"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <h2 className={styles.videoTitle}>{video.title}</h2>

                    <div className={styles.actionRow}>
                        <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.youtubeBtn}
                        >
                            <ExternalLink size={14} />
                            <span>YouTube&apos;da Aç</span>
                        </a>
                    </div>
                </div>

                {/* Content */}
                <div className={styles.contentBody}>
                    {/* SECTION 1: BAĞLI MODLAR */}
                    <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
                        <div className={styles.linkSectionHeader}>
                            <div className={styles.linkSectionTitle}>
                                <Box size={16} style={{ color: 'var(--accent-primary)' }} />
                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Bağlı Modlar
                                </span>
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(181, 228, 208, 0.15)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                    {linkedMods.length} Mod
                                </span>
                            </div>

                            <div className={styles.linkControl}>
                                <button
                                    type="button"
                                    onClick={() => setIsLinkDropdownOpen(!isLinkDropdownOpen)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        backgroundColor: 'rgba(234, 243, 238, 0.08)',
                                        color: 'var(--text-primary)',
                                        fontSize: '12px',
                                        fontWeight: 500
                                    }}
                                >
                                    <Plus size={13} />
                                    Mod Bağla
                                </button>

                                {/* Dropdown Menu */}
                                {isLinkDropdownOpen && (
                                    <>
                                        <div
                                            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                                            onClick={() => setIsLinkDropdownOpen(false)}
                                        />
                                        <div className={styles.linkDropdown}>
                                            <input
                                                type="text"
                                                placeholder="Mod ara..."
                                                value={modSearchTerm}
                                                onChange={(e) => setModSearchTerm(e.target.value)}
                                                autoFocus
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 10px',
                                                    fontSize: '16px',
                                                    marginBottom: '6px',
                                                    backgroundColor: 'var(--bg-color)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '6px',
                                                    color: 'var(--text-primary)'
                                                }}
                                            />

                                            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                                {availableModsToLink.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        onClick={() => handleLinkMod(m.id)}
                                                        style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontSize: '12px',
                                                            color: 'var(--text-primary)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(234, 243, 238, 0.08)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <div className={styles.modInfo}>
                                                            <div style={{ fontWeight: 600 }}>{m.displayName}</div>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{m.modKey}</div>
                                                        </div>
                                                        <Plus size={12} style={{ color: 'var(--accent-primary)' }} />
                                                    </div>
                                                ))}

                                                {availableModsToLink.length === 0 && (
                                                    <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                                        {modSearchTerm ? (
                                                            <div>
                                                                <div>Eşleşen mod bulunamadı.</div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setIsLinkDropdownOpen(false);
                                                                        setIsQuickCreateOpen(true);
                                                                    }}
                                                                    style={{
                                                                        marginTop: '6px',
                                                                        color: 'var(--accent-primary)',
                                                                        fontWeight: 600,
                                                                        fontSize: '11px',
                                                                        textDecoration: 'underline'
                                                                    }}
                                                                >
                                                                    &ldquo;{modSearchTerm}&rdquo; adlı yeni mod oluştur
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            'Tüm mevcut modlar zaten bağlı.'
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {linkedMods.length === 0 ? (
                            <div style={{
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(234, 243, 238, 0.05)',
                                border: '1px dashed var(--border-color)',
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                textAlign: 'center'
                            }}>
                                Bu videoya henüz bir Minecraft modu bağlanmamış. Yukarıdan &ldquo;Mod Bağla&rdquo; butonunu kullanabilirsiniz.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {linkedMods.map((m) => (
                                    <div
                                        key={m.id}
                                        className={styles.linkedModCard}
                                    >
                                        <div className={styles.modInfo}>
                                            <div className={styles.modLabels}>
                                                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{m.displayName}</strong>
                                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({m.modKey})</span>
                                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(234, 243, 238, 0.09)', color: 'var(--text-secondary)' }}>
                                                    {m.syncMode}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--accent-blue)', marginTop: '2px' }}>
                                                <a
                                                    href={`https://github.com/${m.githubOwner}/${m.githubRepository}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={styles.repositoryLink}
                                                >
                                                    {m.githubOwner}/{m.githubRepository} <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        </div>

                                        <button
                                            className={styles.rowAction}
                                            type="button"
                                            onClick={() => handleUnlinkMod(m.id)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                color: 'var(--accent-red)',
                                                fontSize: '11px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Bağlantıyı kaldır"
                                        >
                                            <Trash2 size={11} />
                                            Kaldır
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: ATANAN YOUTUBERLAR */}
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Atanan YouTuberlar</span>
                        <span className={styles.countBadge}>
                            {assignments.length} Kayıt
                        </span>
                    </div>

                    {assignments.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Users size={28} className={styles.emptyIcon} />
                            <p>Bu video için henüz bir YouTuber kaydı bulunmuyor.</p>
                        </div>
                    ) : (
                        <div className={styles.assignmentList}>
                            {assignments.map((a) => {
                                const initial = a.name ? a.name.charAt(0).toUpperCase() : '?';
                                const brokerName = a.brokerId ? brokers[a.brokerId] : null;

                                return (
                                    <div key={a.id} className={styles.assignmentCard}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.youtuberProfile}>
                                                <div className={styles.avatar}>{initial}</div>
                                                <span className={styles.youtuberName}>{a.name}</span>
                                            </div>

                                            {a.createdAt && (
                                                <div className={styles.dateBadge}>
                                                    <Calendar size={13} />
                                                    <span>
                                                        {format(new Date(a.createdAt), 'd MMM yyyy', { locale: tr })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {brokerName && (
                                            <div className={styles.metaRow}>
                                                <span className={styles.brokerTag}>
                                                    <Handshake size={12} />
                                                    Aracı: {brokerName}
                                                </span>
                                            </div>
                                        )}

                                        {a.note ? (
                                            <div className={styles.noteContainer}>
                                                <FileText size={14} className={styles.noteIcon} />
                                                <span className={styles.noteText}>{a.note}</span>
                                            </div>
                                        ) : null}

                                        {/* Minecraft Mod Access Summary */}
                                        {linkedMods.length > 0 && (
                                            <div style={{
                                                marginTop: '12px',
                                                paddingTop: '10px',
                                                borderTop: '1px solid rgba(234, 243, 238, 0.08)',
                                                fontSize: '12px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '11px', fontWeight: 600 }}>
                                                    <Shield size={12} style={{ color: 'var(--accent-primary)' }} />
                                                    Minecraft Mod Erişimi
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {linkedMods.map((m) => {
                                                        const accessRecord = accessMap[`${m.id}_${a.youtuberId}`];
                                                        const isActive = accessRecord?.status === 'ACTIVE';
                                                        const isRevoked = accessRecord?.status === 'REVOKED';
                                                        const pCount = playerCountMap[a.youtuberId] || 0;

                                                        return (
                                                            <div
                                                                key={m.id}
                                                                className={styles.accessRow}
                                                            >
                                                                <div className={styles.accessDetails}>
                                                                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{m.modKey}</span>
                                                                    <span style={{
                                                                        fontSize: '10px',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '4px',
                                                                        backgroundColor: isActive
                                                                            ? 'rgba(34, 197, 94, 0.15)'
                                                                            : isRevoked
                                                                                ? 'rgba(239, 68, 68, 0.15)'
                                                                                : 'rgba(234, 243, 238, 0.08)',
                                                                        color: isActive ? 'var(--accent-green)' : isRevoked ? 'var(--accent-red)' : 'var(--text-secondary)',
                                                                        fontWeight: 600
                                                                    }}>
                                                                        {isActive ? 'Aktif' : isRevoked ? 'Manuel Kaldırıldı' : 'Erişim Yok'}
                                                                    </span>

                                                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                                        {pCount > 0 ? `${pCount} Oyuncu` : 'Oyuncu Yok'}
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    className={styles.rowAction}
                                                                    type="button"
                                                                    onClick={() => setManagingTarget({
                                                                        mod: m,
                                                                        youtuberId: a.youtuberId,
                                                                        youtuberName: a.name
                                                                    })}
                                                                    style={{
                                                                        padding: '3px 8px',
                                                                        borderRadius: '4px',
                                                                        border: '1px solid var(--border-color)',
                                                                        backgroundColor: 'rgba(234, 243, 238, 0.08)',
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: '11px',
                                                                        fontWeight: 500
                                                                    }}
                                                                >
                                                                    Yönet
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Create Mod Modal */}
            {isQuickCreateOpen && (
                <ModModal
                    isOpen={isQuickCreateOpen}
                    onClose={() => setIsQuickCreateOpen(false)}
                    onSuccess={(newMod) => {
                        handleLinkMod(newMod.id);
                    }}
                />
            )}

            {/* Manage YouTuber Mod Access Modal */}
            {managingTarget && (
                <YoutuberModAccessModal
                    isOpen={!!managingTarget}
                    onClose={() => setManagingTarget(null)}
                    mod={managingTarget.mod}
                    youtuberId={managingTarget.youtuberId}
                    youtuberName={managingTarget.youtuberName}
                    access={accessMap[`${managingTarget.mod.id}_${managingTarget.youtuberId}`] || null}
                    activePlayerCount={playerCountMap[managingTarget.youtuberId] || 0}
                    onAccessChanged={() => {
                        // Triggers snapshot refresh
                    }}
                />
            )}
        </div>,
        document.body
    );
}
