'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, AlertCircle, Link as LinkIcon } from 'lucide-react';
import styles from './Videos.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { VideoGridItem } from '@/components/VideoGridItem';
import VideoModal from '@/components/VideoModal';

// Interfaces
interface Video {
    id: string;
    url: string;
    title: string;
    thumbnailUrl: string;
    createdAt?: number;
}

interface YoutuberAssignment {
    id: string;
    youtuberId: string;
    name: string;
    delivered: boolean;
    note: string;
    videoId: string;
}

export default function VideosPage() {
    const { user } = useAuth();

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Data State
    const [videos, setVideos] = useState<Video[]>([]);
    const [assignmentsByVideo, setAssignmentsByVideo] = useState<Record<string, YoutuberAssignment[]>>({});

    // Modal State
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

    // Fetch Videos and Assignments
    useEffect(() => {
        if (!user) return;

        // Fetch Youtube Videos specifically
        const qVideos = query(collection(db, "youtube_videos"), where("userId", "==", user.uid));
        const unsubVideos = onSnapshot(qVideos, (snapshot) => {
            const vids: Video[] = [];
            snapshot.forEach(doc => vids.push({ id: doc.id, ...doc.data() } as Video));

            // Sort by newest first (top-to-bottom relative to insertion time)
            setVideos(vids.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        });

        // Fetch Assignments for these videos
        // For simplicity, we can fetch all assignments for the user and filter locally 
        //, or keep the existing structure since we know the videoId
        const qAssignments = query(collection(db, "assignments"), where("userId", "==", user.uid));
        const unsubAssignments = onSnapshot(qAssignments, (snapshot) => {
            const byVideo: Record<string, YoutuberAssignment[]> = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const assignment = { id: doc.id, ...data } as YoutuberAssignment;
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

    // Helpers
    const extractYoutubeUrl = (url: string) => {
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) return null;
        return url;
    };

    const fetchYoutubeTitle = async (url: string) => {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
            if (!response.ok) return null;
            const data = await response.json();
            return { title: data.title, thumbnail_url: data.thumbnail_url };
        } catch (e) {
            console.error("Error fetching title for", url, e);
            return null;
        }
    };

    const handleAddSingle = async () => {
        setError('');
        setSuccessMessage('');

        if (!bulkInput.trim() || !user) {
            setError('Lütfen bir YouTube linki giriniz.');
            return;
        }

        setLoading(true);

        try {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = bulkInput.match(urlRegex) || [];

            // Allow processing if multiple links are pasted even in single bar, just in case
            let youtubeLinks = matches
                .filter(url => url.includes('youtube.com') || url.includes('youtu.be'))
                .map(url => url.replace(/,$/, '').replace(/"$/, '').replace(/<$/, '').trim());

            youtubeLinks = [...new Set(youtubeLinks)]; // Unique URLs only

            if (youtubeLinks.length === 0) {
                setError('Geçerli bir YouTube linki bulunamadı.');
                return;
            }

            let addedCount = 0;
            // Get the maximum existing timestamp so we guarantee new videos are ALWAYS strictly newer
            const maxExistingTime = videos.length > 0 ? Math.max(...videos.map(v => v.createdAt || 0)) : 0;
            const baseTime = Math.max(new Date().getTime(), maxExistingTime + 1000);

            for (const url of youtubeLinks) {
                const info = await fetchYoutubeTitle(url);
                if (info) {
                    await addDoc(collection(db, "youtube_videos"), {
                        url,
                        title: info.title,
                        thumbnailUrl: info.thumbnail_url,
                        userId: user.uid,
                        // Make sure each subsequent link gets a definitively higher timestamp
                        // so that the LAST link in the array gets the NEWEST time.
                        createdAt: baseTime + (addedCount * 1000)
                    });
                    addedCount++;
                }
            }

            if (addedCount > 0) {
                setBulkInput('');
                setSuccessMessage(`${addedCount} video başarıyla eklendi.`);
                setTimeout(() => setSuccessMessage(''), 3000);
            } else {
                setError('Video eklenemedi. Gizli video veya hatalı link olabilir.');
            }
        } catch (err) {
            console.error(err);
            setError('Video eklenirken beklenmeyen bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteVideo = async (e: React.MouseEvent, videoId: string) => {
        e.stopPropagation();
        if (confirm('Bu videoyu silmek istediğinize emin misiniz?')) {
            try {
                await deleteDoc(doc(db, "youtube_videos", videoId));
                // Clean up assignments
                const relatedAssignments = assignmentsByVideo[videoId] || [];
                relatedAssignments.forEach(a => deleteDoc(doc(db, "assignments", a.id)));

                if (selectedVideo?.id === videoId) setSelectedVideo(null);
            } catch (error) {
                console.error("Error deleting video:", error);
            }
        }
    };

    const handleBulkDeleteAll = async () => {
        if (videos.length === 0) return;

        if (confirm('Tüm videoları ve onlara bağlı atamaları kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
            setLoading(true);
            try {
                // To avoid overloading, we process them in chunks or simply loop and delete
                for (const video of videos) {
                    await deleteDoc(doc(db, "youtube_videos", video.id));

                    const relatedAssignments = assignmentsByVideo[video.id] || [];
                    for (const a of relatedAssignments) {
                        await deleteDoc(doc(db, "assignments", a.id));
                    }
                }
                setSelectedVideo(null);
                setSuccessMessage('Tüm videolar başarıyla silindi.');
                setTimeout(() => setSuccessMessage(''), 3000);
            } catch (err) {
                console.error("Error bulk deleting:", err);
                setError('Toplu silme sırasında bir hata oluştu.');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleUpdateTitle = async (videoId: string, newTitle: string) => {
        try {
            await updateDoc(doc(db, "youtube_videos", videoId), { title: newTitle });
        } catch (error) {
            console.error("Error updating video title:", error);
        }
    };

    // Modal handlers (Assignments)
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

    // Filtering
    const filteredVideos = videos.filter(v =>
        v.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className="page-title" style={{ marginBottom: 0 }}>Videolar</h1>
                    <p className="page-subtitle">Sattığınız YouTube videolarını ve müşterilerinizi takip edin</p>
                </div>
            </div>

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
                            value={bulkInput}
                            onChange={(e) => setBulkInput(e.target.value)}
                            style={{ width: '100%', paddingLeft: '40px' }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSingle()}
                        />
                    </div>

                    <button
                        className="btn-primary"
                        onClick={handleAddSingle}
                        disabled={loading || !bulkInput.trim()}
                    >
                        {loading ? 'Ekleniyor...' : 'Ekle'}
                    </button>
                </div>

                {error && (
                    <div style={{ color: 'var(--accent-red)', fontSize: '13px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={14} /> {error}
                    </div>
                )}

                {successMessage && (
                    <div style={{ color: '#4ade80', fontSize: '13px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> {successMessage}
                    </div>
                )}
            </div>

            <div className={styles.controlsSection}>
                <div className={styles.searchContainer}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        placeholder="Videolarda ara..."
                        className={styles.searchInput}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div className={styles.statsBadge}>
                        Toplam: <span>{filteredVideos.length} Video</span>
                    </div>
                    {videos.length > 0 && (
                        <button
                            className="btn-secondary"
                            style={{
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                color: 'var(--accent-red)',
                                fontSize: '13px',
                                padding: '8px 16px'
                            }}
                            onClick={handleBulkDeleteAll}
                            disabled={loading}
                        >
                            {loading ? 'Siliniyor...' : 'Tümünü Sil'}
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.videoGrid}>
                {filteredVideos.map((video) => (
                    <VideoGridItem
                        key={video.id}
                        video={video}
                        assignmentCount={assignmentsByVideo[video.id]?.length || 0}
                        onClick={() => setSelectedVideo(video)}
                        onDelete={handleDeleteVideo}
                        onUpdateTitle={handleUpdateTitle}
                    />
                ))}
            </div>

            {filteredVideos.length === 0 && (
                <div className={styles.emptyState}>
                    {searchTerm ? 'Aramanıza uygun video bulunamadı.' : 'Henüz video eklenmemiş. Yukarıdan YouTube linkleri yapıştırın.'}
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
        </div>
    );
}
