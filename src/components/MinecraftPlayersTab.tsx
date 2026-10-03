'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    User,
    Star,
    Edit2,
    Trash2,
    Copy,
    Check,
    X,
    Loader2,
    RefreshCw,
    AlertTriangle
} from 'lucide-react';
import styles from './MinecraftPlayersTab.module.css';
import { useAuth } from '@/lib/auth-context';
import { authenticatedFetch } from '@/lib/api-client';
import {
    EnrichedYoutuberPlayer,
    RelationshipType,
    RELATIONSHIP_LABELS,
    subscribeYoutuberPlayers,
    validateMinecraftUsername,
    validateMinecraftUuid
} from '@/lib/minecraft-players';

interface MinecraftPlayersTabProps {
    youtuberId: string;
    youtuberTitle: string;
}

export default function MinecraftPlayersTab({
    youtuberId,
    youtuberTitle
}: MinecraftPlayersTabProps) {
    const { user } = useAuth();
    const [players, setPlayers] = useState<EnrichedYoutuberPlayer[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(true);
    const [activeModsCount, setActiveModsCount] = useState<number>(0);
    const [isSyncingAll, setIsSyncingAll] = useState(false);

    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<EnrichedYoutuberPlayer | null>(null);
    const [formUsername, setFormUsername] = useState('');
    const [formUuid, setFormUuid] = useState('');
    const [formRelationship, setFormRelationship] = useState<RelationshipType>('owner');
    const [formIsPrimary, setFormIsPrimary] = useState(true);
    const [formIsActive, setFormIsActive] = useState(true);
    const [formNote, setFormNote] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [legacyWarning, setLegacyWarning] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Delete dialog state
    const [playerToDelete, setPlayerToDelete] = useState<EnrichedYoutuberPlayer | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Toast state
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [copiedUuid, setCopiedUuid] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => {
            setToastMessage((current) => (current === msg ? null : current));
        }, 3000);
    };

    const fetchActiveModsCount = useCallback(async () => {
        if (!user || !youtuberId) return;
        try {
            const res = await authenticatedFetch(`/api/youtubers/${youtuberId}/active-mods-count`);
            if (res.ok) {
                const data = await res.json();
                setActiveModsCount(typeof data.activeModCount === 'number' ? data.activeModCount : 0);
            }
        } catch {
            // Ignore error
        }
    }, [user, youtuberId]);

    // Subscribe to players and active mods count
    useEffect(() => {
        if (!user || !youtuberId) return;

        setIsLoadingList(true);
        fetchActiveModsCount();

        const unsubscribe = subscribeYoutuberPlayers(
            youtuberId,
            user.uid,
            (data) => {
                setPlayers(data);
                setIsLoadingList(false);
            },
            (err) => {
                console.error('Error fetching players:', err);
                setIsLoadingList(false);
            }
        );

        return () => unsubscribe();
    }, [user, youtuberId, fetchActiveModsCount]);

    const activeCount = players.filter((p) => p.isActive).length;

    const openAddForm = () => {
        setEditingPlayer(null);
        setFormUsername('');
        setFormUuid('');
        const defaultRelationship: RelationshipType = players.some((p) => p.relationshipType === 'owner')
            ? 'friend'
            : 'owner';
        setFormRelationship(defaultRelationship);
        setFormIsPrimary(defaultRelationship === 'owner' && !players.some((p) => p.isPrimary));
        setFormIsActive(true);
        setFormNote('');
        setFormError(null);
        setLegacyWarning(null);
        setIsFormOpen(true);
    };

    const openEditForm = (p: EnrichedYoutuberPlayer) => {
        setEditingPlayer(p);
        setFormUsername(p.player.username);
        setFormUuid(p.player.uuid);
        setFormRelationship(p.relationshipType);
        setFormIsPrimary(p.isPrimary);
        setFormIsActive(p.isActive);
        setFormNote(p.note || '');
        setFormError(null);
        setLegacyWarning(null);
        setIsFormOpen(true);
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingPlayer(null);
        setFormError(null);
    };

    const handleRelationshipChange = (rel: RelationshipType) => {
        setFormRelationship(rel);
        if (rel === 'owner' && !editingPlayer) {
            setFormIsPrimary(true);
        }
    };

    const handleSavePlayer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isSubmitting) return;

        // Validations
        const userVal = validateMinecraftUsername(formUsername);
        if (!userVal.valid) {
            setFormError(userVal.error || 'Geçersiz oyuncu adı.');
            return;
        }

        const uuidVal = validateMinecraftUuid(formUuid);
        if (!uuidVal.valid) {
            setFormError(uuidVal.error || 'Geçersiz UUID.');
            return;
        }

        setIsSubmitting(true);
        setFormError(null);
        setLegacyWarning(null);

        try {
            if (editingPlayer) {
                const res = await authenticatedFetch(
                    `/api/youtubers/${youtuberId}/minecraft-players/${editingPlayer.associationId}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: formUsername,
                            uuid: formUuid,
                            relationshipType: formRelationship,
                            isPrimary: formIsPrimary,
                            isActive: formIsActive,
                            note: formNote
                        })
                    }
                );

                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error || 'Oyuncu güncellenemedi.');
                }

                if (json.legacyConflicts?.length > 0) {
                    setLegacyWarning('Bu UUID legacy README bölümünde bulunduğu için otomatik kaldırılamadı.');
                }

                if (json.affectedModCount > 0) {
                    if (json.syncState === 'SYNCED') {
                        showToast(`Oyuncu güncellendi. ${json.affectedModCount} aktif mod senkronize edildi.`);
                    } else {
                        showToast(`Oyuncu güncellendi. Senkronizasyon kuyruğa alındı (${json.affectedModCount} mod).`);
                    }
                } else {
                    showToast('Oyuncu bilgileri başarıyla güncellendi.');
                }
            } else {
                const res = await authenticatedFetch(`/api/youtubers/${youtuberId}/minecraft-players`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: formUsername,
                        uuid: formUuid,
                        relationshipType: formRelationship,
                        isPrimary: formIsPrimary,
                        isActive: formIsActive,
                        note: formNote
                    })
                });

                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error || 'Oyuncu eklenemedi.');
                }

                if (json.legacyConflicts?.length > 0) {
                    setLegacyWarning('Bu UUID legacy README bölümünde bulunduğu için otomatik kaldırılamadı.');
                }

                if (json.affectedModCount > 0) {
                    if (json.syncState === 'SYNCED') {
                        showToast(`Oyuncu eklendi. ${json.affectedModCount} aktif mod senkronize edildi.`);
                    } else {
                        showToast(`Oyuncu eklendi. Senkronizasyon kuyruğa alındı (${json.affectedModCount} mod).`);
                    }
                } else {
                    showToast('Oyuncu başarıyla eklendi.');
                }
            }

            fetchActiveModsCount();
            closeForm();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Kaydedilirken bir hata oluştu.';
            setFormError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!playerToDelete || isDeleting) return;

        setIsDeleting(true);
        try {
            const res = await authenticatedFetch(
                `/api/youtubers/${youtuberId}/minecraft-players/${playerToDelete.associationId}`,
                {
                    method: 'DELETE'
                }
            );

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Silme işlemi başarısız oldu.');
            }

            if (json.legacyConflicts?.length > 0) {
                setLegacyWarning('Bu UUID legacy README bölümünde bulunduğu için otomatik kaldırılamadı.');
            }

            if (json.affectedModCount > 0) {
                if (json.syncState === 'SYNCED') {
                    showToast(`Oyuncu kaldırıldı. ${json.affectedModCount} aktif moddan silindi ve senkronize edildi.`);
                } else {
                    showToast(`Oyuncu kaldırıldı. Senkronizasyon kuyruğa alındı (${json.affectedModCount} mod).`);
                }
            } else {
                showToast('Oyuncu bağlantısı kaldırıldı.');
            }

            fetchActiveModsCount();
            setPlayerToDelete(null);
        } catch (err) {
            console.error('Error deleting association:', err);
            alert(err instanceof Error ? err.message : 'Silme işlemi başarısız oldu. Lütfen tekrar deneyin.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSyncAllMods = async () => {
        if (!user || isSyncingAll) return;

        setIsSyncingAll(true);
        try {
            const res = await authenticatedFetch(`/api/youtubers/${youtuberId}/sync-mods`, {
                method: 'POST'
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Senkronizasyon başlatılamadı.');
            }

            if (json.legacyConflicts?.length > 0) {
                setLegacyWarning('Bu UUID legacy README bölümünde bulunduğu için otomatik kaldırılamadı.');
            }

            showToast(`${json.affectedModCount || 0} mod senkronizasyonu tamamlandı.`);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Senkronizasyon sırasında hata oluştu.');
        } finally {
            setIsSyncingAll(false);
        }
    };

    const handleCopyUuid = async (uuid: string) => {
        try {
            await navigator.clipboard.writeText(uuid);
            setCopiedUuid(uuid);
            showToast('UUID panoya kopyalandı.');
            setTimeout(() => setCopiedUuid(null), 2000);
        } catch (e) {
            console.error('Failed to copy UUID:', e);
        }
    };

    return (
        <div className={styles.container}>
            {/* Top Bar */}
            <div className={styles.topBar}>
                <div className={styles.titleArea}>
                    <h3 className={styles.tabTitle}>Minecraft Oyuncuları</h3>
                    <span className={styles.countBadge}>{activeCount} aktif oyuncu</span>
                </div>
                <div className={styles.topActions}>
                    <button
                        type="button"
                        className={styles.syncModsBtn}
                        onClick={handleSyncAllMods}
                        disabled={isSyncingAll}
                        title="Bu YouTuber'ın erişim sahibi olduğu bütün aktif mod repository'lerini senkronize et"
                    >
                        <RefreshCw size={13} className={isSyncingAll ? 'spin' : ''} />
                        {isSyncingAll ? 'Senkronize Ediliyor...' : 'İlgili Modları Senkronize Et'}
                    </button>
                    {!isFormOpen && (
                        <button
                            type="button"
                            className={styles.addBtn}
                            onClick={openAddForm}
                        >
                            <Plus size={15} />
                            Oyuncu Ekle
                        </button>
                    )}
                </div>
            </div>

            {legacyWarning && (
                <div className={styles.warningBanner}>
                    <AlertTriangle size={15} />
                    <span>{legacyWarning}</span>
                </div>
            )}

            {/* Inline Add / Edit Form Card */}
            {isFormOpen && (
                <form className={styles.formCard} onSubmit={handleSavePlayer}>
                    <div className={styles.formHeader}>
                        <span className={styles.formTitle}>
                            {editingPlayer ? 'Oyuncuyu Düzenle' : 'Yeni Minecraft Oyuncusu Ekle'}
                        </span>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={closeForm}
                            aria-label="Formu Kapat"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className={styles.formGrid}>
                        {/* Oyuncu Adı */}
                        <div className={styles.formGroup}>
                            <label className={styles.label}>
                                Minecraft Oyuncu Adı <span className={styles.requiredStar}>*</span>
                            </label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="Örn: Notch"
                                value={formUsername}
                                onChange={(e) => setFormUsername(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>

                        {/* Minecraft UUID */}
                        <div className={styles.formGroup}>
                            <label className={styles.label}>
                                Minecraft UUID <span className={styles.requiredStar}>*</span>
                            </label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="550e8400-e29b-41d4-a716-446655440000 veya 32 karakter"
                                value={formUuid}
                                onChange={(e) => setFormUuid(e.target.value)}
                                required
                            />
                        </div>

                        {/* İlişki */}
                        <div className={styles.formGroup}>
                            <label className={styles.label}>İlişki</label>
                            <select
                                className={styles.select}
                                value={formRelationship}
                                onChange={(e) => handleRelationshipChange(e.target.value as RelationshipType)}
                            >
                                <option value="owner">YouTuber’ın Kendisi</option>
                                <option value="friend">Arkadaş</option>
                                <option value="team">Ekip Üyesi</option>
                                <option value="other">Diğer</option>
                            </select>
                        </div>

                        {/* Ana Oyuncu Toggle */}
                        <div className={styles.toggleRow}>
                            <div className={styles.toggleLabel}>
                                <span className={styles.toggleTitle}>Ana Oyuncu</span>
                                <span className={styles.toggleDesc}>
                                    YouTuber için birincil Minecraft kimliği olarak belirlenir
                                </span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={formIsPrimary}
                                    onChange={(e) => setFormIsPrimary(e.target.checked)}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>

                        {/* Aktif Switch */}
                        <div className={styles.toggleRow}>
                            <div className={styles.toggleLabel}>
                                <span className={styles.toggleTitle}>Aktif Durum</span>
                                <span className={styles.toggleDesc}>
                                    Pasif oyuncular mod erişim listelerine dahil edilmez
                                </span>
                            </div>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={formIsActive}
                                    onChange={(e) => setFormIsActive(e.target.checked)}
                                />
                                <span className={styles.slider}></span>
                            </label>
                        </div>

                        {/* Not */}
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Not (İsteğe Bağlı)</label>
                            <textarea
                                className={styles.textarea}
                                placeholder="Örn: Videolara sık sık katılıyor veya sadece survival serisinde"
                                value={formNote}
                                onChange={(e) => setFormNote(e.target.value)}
                            />
                        </div>
                    </div>

                    {formError && <div className={styles.formError}>{formError}</div>}

                    <div className={styles.formActions}>
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={closeForm}
                            disabled={isSubmitting}
                        >
                            İptal
                        </button>
                        <button
                            type="submit"
                            className={styles.saveBtn}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={14} className="spin" />
                                    Kaydediliyor...
                                </>
                            ) : (
                                'Oyuncuyu Kaydet'
                            )}
                        </button>
                    </div>
                </form>
            )}

            {/* Empty State */}
            {!isLoadingList && players.length === 0 && !isFormOpen && (
                <div className={styles.emptyCard}>
                    <div className={styles.emptyIconWrap}>
                        <User size={22} />
                    </div>
                    <div className={styles.emptyTitle}>Henüz Minecraft oyuncusu eklenmemiş.</div>
                    <div className={styles.emptyText}>
                        Bu YouTuber’ın kendisini ve videolara birlikte girdiği arkadaşlarını buraya ekleyebilirsin.
                    </div>
                    <button
                        type="button"
                        className={styles.emptyActionBtn}
                        onClick={openAddForm}
                    >
                        <Plus size={15} />
                        İlk Oyuncuyu Ekle
                    </button>
                </div>
            )}

            {/* Player List */}
            {!isFormOpen && players.length > 0 && (
                <div className={styles.playerList}>
                    {players.map((p) => {
                        const isPassive = !p.isActive;
                        return (
                            <div
                                key={p.associationId}
                                className={`${styles.playerCard} ${isPassive ? styles.passiveCard : ''}`}
                            >
                                <div className={styles.cardTop}>
                                    <div className={styles.playerIdentity}>
                                        <div className={styles.avatarWrap}>
                                            <img
                                                src={`https://mc-heads.net/avatar/${p.player.uuid}/34`}
                                                alt={p.player.username}
                                                className={styles.avatarImg}
                                                onError={(e) => {
                                                    // Fallback to avatarFallback icon if image fails
                                                    e.currentTarget.style.display = 'none';
                                                    if (e.currentTarget.nextElementSibling) {
                                                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                                    }
                                                }}
                                            />
                                            <span
                                                className={styles.avatarFallback}
                                                style={{ display: 'none' }}
                                            >
                                                <User size={18} />
                                            </span>
                                        </div>

                                        <div className={styles.nameAndBadges}>
                                            <div className={styles.nameRow}>
                                                <span className={styles.playerName}>{p.player.username}</span>
                                                <div className={styles.badges}>
                                                    {p.isPrimary && (
                                                        <span className={`${styles.badge} ${styles.badgePrimary}`}>
                                                            <Star size={10} fill="currentColor" />
                                                            Ana Oyuncu
                                                        </span>
                                                    )}
                                                    <span
                                                        className={`${styles.badge} ${
                                                            p.relationshipType === 'owner'
                                                                ? styles.badgeOwner
                                                                : p.relationshipType === 'friend'
                                                                ? styles.badgeFriend
                                                                : p.relationshipType === 'team'
                                                                ? styles.badgeTeam
                                                                : styles.badgeOther
                                                        }`}
                                                    >
                                                        {RELATIONSHIP_LABELS[p.relationshipType]}
                                                    </span>
                                                    {isPassive && (
                                                        <span className={`${styles.badge} ${styles.badgePassive}`}>
                                                            Pasif
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className={styles.cardActions}>
                                        <button
                                            type="button"
                                            className={styles.iconBtn}
                                            onClick={() => openEditForm(p)}
                                            title="Oyuncuyu Düzenle"
                                            aria-label="Oyuncuyu Düzenle"
                                        >
                                            <Edit2 size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.iconBtn} ${styles.deleteIconBtn}`}
                                            onClick={() => setPlayerToDelete(p)}
                                            title="Bağlantıyı Kaldır"
                                            aria-label="Bağlantıyı Kaldır"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>

                                {/* Monospace UUID with Copy Button */}
                                <div className={styles.uuidRow}>
                                    <span className={styles.uuidText} title={p.player.uuid}>
                                        {p.player.uuid}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.copyBtn}
                                        onClick={() => handleCopyUuid(p.player.uuid)}
                                        title="UUID Kopyala"
                                    >
                                        {copiedUuid === p.player.uuid ? (
                                            <>
                                                <Check size={12} />
                                                <span>Kopyalandı</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={12} />
                                                <span>Kopyala</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Note */}
                                {p.note && (
                                    <div className={styles.playerNote}>
                                        Not: {p.note}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Delete Confirmation Modal Dialog */}
            {playerToDelete && (
                <div
                    className={styles.confirmOverlay}
                    onClick={() => !isDeleting && setPlayerToDelete(null)}
                >
                    <div
                        className={styles.confirmBox}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h4 className={styles.confirmTitle}>Oyuncu bağlantısını kaldır</h4>
                        <p className={styles.confirmMessage}>
                            <span className={styles.confirmHighlight}>“{playerToDelete.player.username}”</span> adlı Minecraft oyuncusunun {youtuberTitle} ile bağlantısı kaldırılacak.
                            {activeModsCount > 0 ? (
                                <span style={{ display: 'block', marginTop: '6px', color: 'var(--accent-yellow)' }}>
                                    Bu oyuncu {activeModsCount} aktif modun allowlist&apos;inden kaldırılacak.
                                </span>
                            ) : null}
                        </p>
                        <div className={styles.confirmActions}>
                            <button
                                type="button"
                                className={styles.confirmCancelBtn}
                                onClick={() => setPlayerToDelete(null)}
                                disabled={isDeleting}
                            >
                                Vazgeç
                            </button>
                            <button
                                type="button"
                                className={styles.confirmDeleteBtn}
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Kaldırılıyor...' : 'Bağlantıyı Kaldır'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toastMessage && (
                <div className={styles.toast}>
                    <Check size={16} />
                    <span>{toastMessage}</span>
                </div>
            )}
        </div>
    );
}
