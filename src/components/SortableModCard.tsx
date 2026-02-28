import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical, Edit2, Check, X } from 'lucide-react';
import styles from '@/app/home/Home.module.css';

interface SortableModCardProps {
    video: {
        id: string;
        title: string;
        thumbnailUrl: string;
    };
    assignmentCount: number;
    onClick: () => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onUpdateTitle: (id: string, newTitle: string) => void;
}

export function SortableModCard({ video, assignmentCount, onClick, onDelete, onUpdateTitle }: SortableModCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: video.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : 1,
        opacity: isDragging ? 0.8 : 1,
        position: 'relative' as const,
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editTempTitle, setEditTempTitle] = useState(video.title);

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
        <div
            ref={setNodeRef}
            style={style}
            className={styles.videoCard}
            onClick={!isEditing ? onClick : undefined}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 10, cursor: 'grab', backgroundColor: 'rgba(0,0,0,0.5)', padding: '4px', borderRadius: '4px' }}
                onClick={(e) => e.stopPropagation()} // Prevent opening modal when clicking drag handle
            >
                <GripVertical size={16} color="white" />
            </div>

            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 10, display: 'flex', gap: '8px' }}>
                <button
                    className={styles.actionBtnSecondary}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                        setEditTempTitle(video.title);
                    }}
                    style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '50%', border: 'none', color: 'white', cursor: 'pointer' }}
                >
                    <Edit2 size={14} />
                </button>
                <button
                    className={styles.deleteVideoBtn}
                    onClick={(e) => onDelete(e, video.id)}
                    style={{ position: 'relative', top: 0, right: 0 }} // Override absolute positioning from default class if needed
                >
                    <Trash2 size={14} />
                </button>
            </div>

            <div className={styles.thumbnailContainer}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={video.thumbnailUrl} alt={video.title} className={styles.thumbnailImage} />
            </div>

            <div className={styles.videoInfo}>
                {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                        <input
                            type="text"
                            value={editTempTitle}
                            onChange={(e) => setEditTempTitle(e.target.value)}
                            style={{
                                width: '100%', padding: '4px 8px', borderRadius: '4px',
                                border: '1px solid var(--accent-purple)', backgroundColor: '#1A1D28', color: 'white'
                            }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                            <button onClick={handleCancelEdit} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                <X size={14} />
                            </button>
                            <button onClick={handleSaveEdit} style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', padding: '4px' }}>
                                <Check size={14} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <h3 className={styles.videoTitle}>{video.title}</h3>
                )}

                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent-purple)', fontWeight: 500 }}>
                    {assignmentCount} Youtuber Atandı
                </div>
            </div>
        </div>
    );
}
