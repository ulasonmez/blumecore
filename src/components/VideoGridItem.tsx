import React from 'react';
import { Trash2, Edit2, PlayCircle } from 'lucide-react';
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
    onUpdateTitle: (id: string, newTitle: string) => void;
}

export function VideoGridItem({ video, assignmentCount, onClick, onDelete, onUpdateTitle }: VideoGridItemProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editTempTitle, setEditTempTitle] = React.useState(video.title);

    const handleSaveEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editTempTitle.trim() && editTempTitle !== video.title) {
            onUpdateTitle(video.id, editTempTitle.trim());
        }
        setIsEditing(false);
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditTempTitle(video.title);
        setIsEditing(false);
    };

    return (
        <div className={styles.videoCard} onClick={!isEditing ? onClick : undefined}>
            <div className={styles.actionBar}>
                <button
                    className={styles.actionBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                        setEditTempTitle(video.title);
                    }}
                >
                    <Edit2 size={14} />
                </button>
                <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={(e) => onDelete(e, video.id)}
                >
                    <Trash2 size={14} />
                </button>
            </div>

            <div className={styles.header}>
                <PlayCircle size={24} className={styles.icon} />
                <div className={styles.titleContainer}>
                    {isEditing ? (
                        <div className={styles.editMode} onClick={(e) => e.stopPropagation()}>
                            <input
                                type="text"
                                value={editTempTitle}
                                onChange={(e) => setEditTempTitle(e.target.value)}
                                className={styles.editInput}
                                autoFocus
                            />
                            <div className={styles.editActions}>
                                <button className={styles.cancelBtn} onClick={handleCancelEdit}>İptal</button>
                                <button className={styles.saveBtn} onClick={handleSaveEdit}>Kaydet</button>
                            </div>
                        </div>
                    ) : (
                        <h3 className={styles.videoTitle}>{video.title}</h3>
                    )}
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
        </div>
    );
}
