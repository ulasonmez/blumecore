'use client';

import React, { useState, useEffect } from 'react';
import {
    Plus,
    User,
    Star,
    Edit2,
    Trash2,
    Copy,
    Check,
    X,
    Loader2
} from 'lucide-react';
import styles from './MinecraftPlayersTab.module.css';
import { useAuth } from '@/lib/auth-context';
import {
    EnrichedYoutuberPlayer,
    RelationshipType,
    RELATIONSHIP_LABELS,
    subscribeYoutuberPlayers,
    addPlayerToYoutuber,
    updateYoutuberPlayer,
    deleteYoutuberPlayerAssociation,
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
        }, 2500);
    };

    // Subscribe to players
    useEffect(() => {
        if (!user || !youtuberId) return;

        setIsLoadingList(true);
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
    }, [user, youtuberId]);

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

        try {
            if (editingPlayer) {
                await updateYoutuberPlayer({
                    associationId: editingPlayer.associationId,
                    youtuberId,
                    userId: user.uid,
                    username: formUsername,
                    uuid: formUuid,
                    relationshipType: formRelationship,
                    isPrimary: formIsPrimary,
                    isActive: formIsActive,
                    note: formNote
                });
                showToast('Oyuncu bilgileri başarıyla güncellendi.');
            } else {
                await addPlayerToYoutuber({
                    youtuberId,
                    userId: user.uid,
                    username: formUsername,
                    uuid: formUuid,
                    relationshipType: formRelationship,
                    isPrimary: formIsPrimary,
                    isActive: formIsActive,
                    note: formNote
                });
                showToast('Minecraft oyuncusu başarıyla eklendi.');
            }
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
            await deleteYoutuberPlayerAssociation(playerToDelete.associationId, youtuberId);
            showToast('Oyuncu bağlantısı kaldırıldı.');
            setPlayerToDelete(null);
        } catch (err) {
            console.error('Error deleting association:', err);
            alert('Silme işlemi başarısız oldu. Lütfen tekrar deneyin.');
        } finally {
            setIsDeleting(false);
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
                            <span className={styles.confirmHighlight}>“{playerToDelete.player.username}”</span> adlı Minecraft oyuncusunun{' '}
                            <span className={styles.confirmHighlight}>{youtuberTitle}</span> ile bağlantısı kaldırılacak. Devam etmek istiyor musun?
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
