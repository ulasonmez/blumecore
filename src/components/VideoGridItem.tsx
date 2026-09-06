import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, PlayCircle, Link as LinkIcon, AlertCircle } from 'lucide-react';
import styles from './VideoGridItem.module.css';

interface VideoGridItemProps {
    video: {
        id: string;
        title: string;
        url: string;
        thumbnailUrl: string;
    };
    assignmentCount: number;
    onClick: () => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onUpdateVideo?: (id: string, newTitle: string, newUrl: string) => Promise<boolean | void> | void;
    onUpdateTitle?: (id: string, newTitle: string) => void;
}

export function VideoGridItem({
    video,
    assignmentCount,
    onClick,
    onDelete,
    onUpdateVideo,
    onUpdateTitle
}: VideoGridItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editTempTitle, setEditTempTitle] = useState(video.title);
    const [editTempUrl, setEditTempUrl] = useState(video.url);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isEditing) {
            setEditTempTitle(video.title);
            setEditTempUrl(video.url);
        }
    }, [video.title, video.url, isEditing]);

    const handleStartEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditTempTitle(video.title);
        setEditTempUrl(video.url);
        setError('');
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditTempTitle(video.title);
        setEditTempUrl(video.url);
        setError('');
        setIsEditing(false);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const trimmedTitle = editTempTitle.trim();
        const trimmedUrl = editTempUrl.trim();

        if (!trimmedTitle) {
            setError('Lütfen bir video başlığı girin.');
            return;
        }

        if (!trimmedUrl) {
            setError('Lütfen bir video linki girin.');
            return;
        }

        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
            setError('Geçerli bir URL giriniz (https://...)');
            return;
        }

        // If no changes were made
        if (trimmedTitle === video.title && trimmedUrl === video.url) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        setError('');

        try {
            if (onUpdateVideo) {
                await onUpdateVideo(video.id, trimmedTitle, trimmedUrl);
            } else if (onUpdateTitle) {
                await onUpdateTitle(video.id, trimmedTitle);
            }
            setIsEditing(false);
        } catch (err) {
            console.error('Video kaydedilirken hata oluştu:', err);
            setError('Video kaydedilirken bir hata oluştu.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className={`${styles.videoCard} ${isEditing ? styles.editingCard : ''}`}
            onClick={!isEditing ? onClick : undefined}
        >
            {!isEditing && (
                <div className={styles.actionBar}>
                    <button
                        className={styles.actionBtn}
                        onClick={handleStartEdit}
                        title="Düzenle"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={(e) => onDelete(e, video.id)}
                        title="Sil"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}

            {isEditing ? (
                <form className={styles.editForm} onSubmit={handleSaveEdit} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.editField}>
                        <label className={styles.editLabel}>Video Başlığı</label>
                        <input
                            type="text"
                            value={editTempTitle}
                            onChange={(e) => setEditTempTitle(e.target.value)}
                            className={styles.editInput}
                            placeholder="Video başlığı"
                            autoFocus
                            disabled={isSaving}
                        />
                    </div>

                    <div className={styles.editField}>
                        <label className={styles.editLabel}>Video Linki</label>
                        <div className={styles.linkInputWrapper}>
                            <LinkIcon size={14} className={styles.inputIcon} />
                            <input
                                type="url"
                                value={editTempUrl}
                                onChange={(e) => setEditTempUrl(e.target.value)}
                                className={`${styles.editInput} ${styles.inputWithIcon}`}
                                placeholder="https://www.youtube.com/watch?v=..."
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className={styles.editError}>
                            <AlertCircle size={13} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className={styles.editActions}>
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                        >
                            İptal
                        </button>
                        <button
                            type="submit"
                            className={styles.saveBtn}
                            disabled={isSaving}
                        >
                            {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    <div className={styles.header}>
                        <PlayCircle size={24} className={styles.icon} />
                        <div className={styles.titleContainer}>
                            <h3 className={styles.videoTitle}>{video.title}</h3>
                        </div>
                    </div>

                    <div className={styles.footer}>
                        <span className={styles.assignmentCount}>
                            {assignmentCount} YouTuber Atandı
                        </span>
                        <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                            onClick={(e) => e.stopPropagation()}
                        >
                            Videoya Git
                        </a>
                    </div>
                </>
            )}
        </div>
    );
}
