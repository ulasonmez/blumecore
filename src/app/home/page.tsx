'use client';

import { useState, useEffect } from 'react';
import { Trash2, Link as LinkIcon, AlertCircle, Clock } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import styles from './Home.module.css';
import VideoModal from '@/components/VideoModal';
import PendingPaymentsModal from '@/components/PendingPaymentsModal';
import { SortableModCard } from '@/components/SortableModCard';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

// Interfaces for our state
interface Video {
    id: string;
    url: string;
    title: string;
    thumbnailUrl: string;
    order?: number;
    createdAt?: number;
}

interface YoutuberAssignment {
    id: string; // unique assignment id
    youtuberId: string;
    name: string;
    delivered: boolean;
    note: string;
}

export default function HomePage() {
    const { user } = useAuth();
    const [linkInput, setLinkInput] = useState('');
    const [videos, setVideos] = useState<Video[]>([]);
    const [assignmentsByVideo, setAssignmentsByVideo] = useState<Record<string, YoutuberAssignment[]>>({});

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [isPendingOpen, setIsPendingOpen] = useState(false);

    useEffect(() => {
        if (!user) return;

        const qVideos = query(collection(db, "videos"), where("userId", "==", user.uid));
        const unsubVideos = onSnapshot(qVideos, (snapshot) => {
            const vids: Video[] = [];
            snapshot.forEach(doc => vids.push({ id: doc.id, ...doc.data() } as Video));
            // Sort by order ascending, then by createdAt desc for items without order
            setVideos(vids.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (b.createdAt || 0) - (a.createdAt || 0);
            }));
        });

        const qAssignments = query(collection(db, "assignments"), where("userId", "==", user.uid));
        const unsubAssignments = onSnapshot(qAssignments, (snapshot) => {
            const byVideo: Record<string, YoutuberAssignment[]> = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const assignment = { id: doc.id, ...data } as YoutuberAssignment & { videoId: string };
                if (!byVideo[assignment.videoId]) byVideo[assignment.videoId] = [];
                byVideo[assignment.videoId].push(assignment);
            });
            setAssignmentsByVideo(byVideo);
        });

        return () => {
            unsubVideos();
            unsubAssignments();
        };
    }, [user]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require dragging a bit to differentiate from clicks
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = videos.findIndex(v => v.id === active.id);
            const newIndex = videos.findIndex(v => v.id === over.id);

            const newVideos = arrayMove(videos, oldIndex, newIndex);

            // Immediately update local state for smooth UI
            setVideos(newVideos);

            // Save new order to Firestore using batch
            const batch = writeBatch(db);
            newVideos.forEach((video, index) => {
                const vidRef = doc(db, "videos", video.id);
                batch.update(vidRef, { order: index });
            });

            try {
                await batch.commit();
            } catch (err) {
                console.error("Error saving order: ", err);
            }
        }
    };

    const extractYoutubeUrl = (url: string) => {
        // Basic validation
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) return null;
        return url;
    };

    const handleAddLink = async () => {
        setError('');
        const url = extractYoutubeUrl(linkInput);

        if (!url || !user) {
            setError('Geçerli bir YouTube linki giriniz.');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
            if (!response.ok) throw new Error('Video bilgisi alınamadı.');

            const data = await response.json();

            await addDoc(collection(db, "videos"), {
                url,
                title: data.title,
                thumbnailUrl: data.thumbnail_url,
                userId: user.uid,
                createdAt: new Date().getTime(),
                order: videos.length
            });

            setLinkInput('');
        } catch (err) {
            console.error(err);
            setError('Video eklenirken bir hata oluştu veya gizli bir video.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteVideo = async (e: React.MouseEvent, videoId: string) => {
        e.stopPropagation();
        if (confirm('Bu videoyu silmek istediğinize emin misiniz?')) {
            try {
                await deleteDoc(doc(db, "videos", videoId));
                // Clean up assignments
                const relatedAssignments = assignmentsByVideo[videoId] || [];
                relatedAssignments.forEach(a => deleteDoc(doc(db, "assignments", a.id)));

                if (selectedVideo?.id === videoId) setSelectedVideo(null);
            } catch (error) {
                console.error("Error deleting video:", error);
            }
        }
    };

    const handleUpdateTitle = async (videoId: string, newTitle: string) => {
        try {
            await updateDoc(doc(db, "videos", videoId), { title: newTitle });
        } catch (error) {
            console.error("Error updating video title:", error);
        }
    };

    // Modal handlers
    const handleUpdateAssignment = async (videoId: string, assignmentId: string, updates: Partial<YoutuberAssignment>) => {
        try {
            await updateDoc(doc(db, "assignments", assignmentId), updates);
        } catch (error) {
            console.error("Error updating assignment:", error);
        }
    };

    const handleDeleteAssignment = async (videoId: string, assignmentId: string) => {
        try {
            await deleteDoc(doc(db, "assignments", assignmentId));
        } catch (error) {
            console.error("Error deleting assignment:", error);
        }
    };

    const handleAddAssignment = async (videoId: string, youtuberId: string, name: string) => {
        if (!user) return;
        try {
            await addDoc(collection(db, "assignments"), {
                videoId,
                youtuberId,
                name,
                delivered: false,
                note: '',
                userId: user.uid,
                createdAt: new Date().getTime()
            });
        } catch (error) {
            console.error("Error adding assignment:", error);
        }
    };

    return (
        <div className={styles.container}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <h1 className="page-title" style={{ marginBottom: 0 }}>Mods</h1>
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
            <p className="page-subtitle">Modlarınızı düzenleyin ve görev atamalarınızı yapın</p>

            <div className="card" style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    YouTube video linkini yapıştırın:
                </p>

                <div className={styles.addVideoSection}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <LinkIcon size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            className={styles.videoInput}
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={linkInput}
                            onChange={(e) => setLinkInput(e.target.value)}
                            style={{ width: '100%', paddingLeft: '40px' }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                        />
                    </div>
                    <button
                        className="btn-primary"
                        onClick={handleAddLink}
                        disabled={loading || !linkInput.trim()}
                    >
                        {loading ? 'Ekleniyor...' : 'Ekle'}
                    </button>
                </div>

                {error && (
                    <div style={{ color: 'var(--accent-red)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={14} /> {error}
                    </div>
                )}
            </div>

            <div className={styles.videoGrid}>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={videos.map(v => v.id)}
                        strategy={rectSortingStrategy}
                    >
                        {videos.map((video) => (
                            <SortableModCard
                                key={video.id}
                                video={video}
                                assignmentCount={assignmentsByVideo[video.id]?.length || 0}
                                onClick={() => setSelectedVideo(video)}
                                onDelete={handleDeleteVideo}
                                onUpdateTitle={handleUpdateTitle}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>

            {videos.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0', border: '1px dashed var(--border-color)', borderRadius: '16px' }}>
                    Henüz video eklenmemiş. Yukarıdan bir YouTube linki yapıştırın.
                </div>
            )}

            {selectedVideo && (
                <VideoModal
                    isOpen={!!selectedVideo}
                    onClose={() => setSelectedVideo(null)}
                    video={selectedVideo}
                    assignments={assignmentsByVideo[selectedVideo.id] || []}
                    onUpdateAssignment={(id, updates) => handleUpdateAssignment(selectedVideo.id, id, updates)}
                    onDeleteAssignment={(id) => handleDeleteAssignment(selectedVideo.id, id)}
                    onAddAssignment={(yId, name) => handleAddAssignment(selectedVideo.id, yId, name)}
                />
            )}

            <PendingPaymentsModal
                isOpen={isPendingOpen}
                onClose={() => setIsPendingOpen(false)}
            />
        </div>
    );
}
