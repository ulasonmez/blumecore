'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, AlertCircle, Link as LinkIcon, ExternalLink, RefreshCw, CheckCircle2, Globe } from 'lucide-react';
import styles from './Videos.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { VideoGridItem } from '@/components/VideoGridItem';
import VideoDetailModal from '@/components/VideoDetailModal';
import ModModal from '@/components/ModModal';
import ModDetailModal from '@/components/ModDetailModal';
import { authenticatedFetch } from '@/lib/api-client';
import { ModProject, resolveModLifecycleStatus } from '@/lib/mods/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

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

    // Segmented tab state
    const [activeMainTab, setActiveMainTab] = useState<'videos' | 'mods'>('videos');

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Data State
    const [videos, setVideos] = useState<Video[]>([]);
    const [assignmentsByVideo, setAssignmentsByVideo] = useState<Record<string, YoutuberAssignment[]>>({});
    const [mods, setMods] = useState<ModProject[]>([]);
    const [modsByVideo, setModsByVideo] = useState<Record<string, string[]>>({});
    const [modStats, setModStats] = useState<Record<string, { videoCount: number; youtuberCount: number }>>({});

    // Mod filter states
    const [modSearchTerm, setModSearchTerm] = useState('');
    const [modStatusFilter, setModStatusFilter] = useState<'all' | 'active' | 'passive'>('all');

    // Modal State
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [isAddModModalOpen, setIsAddModModalOpen] = useState(false);
    const [selectedModForDetail, setSelectedModForDetail] = useState<ModProject | null>(null);
    const [syncingModId, setSyncingModId] = useState<string | null>(null);
    const [modToast, setModToast] = useState<string | null>(null);

    const showModToast = (msg: string) => {
        setModToast(msg);
        setTimeout(() => setModToast(null), 3000);
    };

    // Fetch Videos, Assignments, Mods, and Links
    useEffect(() => {
        if (!user) return;

        // Fetch Youtube Videos specifically
        const qVideos = query(collection(db, "youtube_videos"), where("userId", "==", user.uid));
        const unsubVideos = onSnapshot(qVideos, (snapshot) => {
            const vids: Video[] = [];
            snapshot.forEach(doc => vids.push({ id: doc.id, ...doc.data() } as Video));
            setVideos(vids.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        });

        // Fetch Assignments for these videos
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

        // Fetch Mods
        const qMods = query(collection(db, "mod_projects"), where("userId", "==", user.uid));
        const unsubMods = onSnapshot(qMods, (snapshot) => {
            const modItems: ModProject[] = [];
            snapshot.forEach(doc => {
                const data = doc.data() as Omit<ModProject, 'id'>;
                const status = resolveModLifecycleStatus(data);
                if (status !== 'ARCHIVED') {
                    modItems.push({ id: doc.id, ...data, lifecycleStatus: status });
                }
            });
            modItems.sort((a, b) => {
                const aActive = resolveModLifecycleStatus(a) === 'ACTIVE';
                const bActive = resolveModLifecycleStatus(b) === 'ACTIVE';
                if (aActive !== bActive) return aActive ? -1 : 1;
                return b.createdAt - a.createdAt;
            });
            setMods(modItems);
        });

        // Fetch Video-Mod Links
        const qLinks = query(collection(db, "video_mod_projects"), where("userId", "==", user.uid));
        const unsubLinks = onSnapshot(qLinks, (snapshot) => {
            const byVid: Record<string, string[]> = {};
            const counts: Record<string, number> = {};
            snapshot.forEach(doc => {
                const d = doc.data();
                if (!byVid[d.videoId]) byVid[d.videoId] = [];
                byVid[d.videoId].push(d.modProjectId);
                counts[d.modProjectId] = (counts[d.modProjectId] || 0) + 1;
            });
            setModsByVideo(byVid);
        });

        // Fetch YouTuber Access for Counts
        const qAccess = query(collection(db, "youtuber_mod_access"), where("userId", "==", user.uid), where("status", "==", "ACTIVE"));
        const unsubAccess = onSnapshot(qAccess, (snapshot) => {
            const counts: Record<string, number> = {};
            snapshot.forEach(doc => {
                const d = doc.data();
                counts[d.modProjectId] = (counts[d.modProjectId] || 0) + 1;
            });
            setModStats(prev => {
                const next: Record<string, { videoCount: number; youtuberCount: number }> = {};
                for (const m of mods) {
                    next[m.id] = {
                        videoCount: prev[m.id]?.videoCount || 0,
                        youtuberCount: counts[m.id] || 0
                    };
                }
                return next;
            });
        });

        return () => {
            unsubVideos();
            unsubAssignments();
            unsubMods();
            unsubLinks();
            unsubAccess();
        };
    }, [user, mods.length]);

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
                // Single server API call: deletes video, assignments, links, and cascades access in one transaction
                await authenticatedFetch(`/api/videos/${videoId}`, {
                    method: 'DELETE'
                });

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

    // Keep selectedVideo in sync when videos list updates
    useEffect(() => {
        if (selectedVideo) {
            const current = videos.find(v => v.id === selectedVideo.id);
            if (current && (current.title !== selectedVideo.title || current.url !== selectedVideo.url)) {
                setSelectedVideo(current);
            }
        }
    }, [videos, selectedVideo]);

    const handleUpdateVideo = async (videoId: string, newTitle: string, newUrl: string) => {
        try {
            const currentVideo = videos.find(v => v.id === videoId);
            const updates: Partial<Video> = {
                title: newTitle.trim(),
                url: newUrl.trim(),
            };

            if (currentVideo && currentVideo.url !== newUrl.trim()) {
                const info = await fetchYoutubeTitle(newUrl.trim());
                if (info?.thumbnail_url) {
                    updates.thumbnailUrl = info.thumbnail_url;
                }
            }

            await updateDoc(doc(db, "youtube_videos", videoId), updates);
        } catch (error) {
            console.error("Error updating video:", error);
            throw error;
        }
    };

    const handleUpdateTitle = async (videoId: string, newTitle: string) => {
        try {
            await updateDoc(doc(db, "youtube_videos", videoId), { title: newTitle });
        } catch (error) {
            console.error("Error updating video title:", error);
        }
    };



    // Filtering videos
    const filteredVideos = videos.filter(v =>
        v.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filtering mods
    const filteredMods = mods.filter(m => {
        const matchesSearch =
            m.displayName.toLowerCase().includes(modSearchTerm.toLowerCase()) ||
            m.modKey.toLowerCase().includes(modSearchTerm.toLowerCase()) ||
            m.githubRepository.toLowerCase().includes(modSearchTerm.toLowerCase());

        if (!matchesSearch) return false;
        if (modStatusFilter === 'active') return m.isActive;
        if (modStatusFilter === 'passive') return !m.isActive;
        return true;
    });

    const handleQuickSyncMod = async (modId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || syncingModId) return;
        setSyncingModId(modId);
        try {
            const res = await authenticatedFetch(`/api/mods/${modId}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ triggerType: 'MANUAL_SYNC' })
            });
            const json = await res.json();
            if (res.ok) {
                showModToast(json.data?.message || 'Mod başarıyla senkronize edildi.');
            } else {
                showModToast(`Hata: ${json.error || 'Senkronizasyon başarısız'}`);
            }
        } catch (err) {
            showModToast('Ağ hatası oluştu.');
        } finally {
            setSyncingModId(null);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className="page-title" style={{ marginBottom: 0 }}>
                        {activeMainTab === 'videos' ? 'Videolar' : 'Minecraft Modları'}
                    </h1>
                    <p className="page-subtitle">
                        {activeMainTab === 'videos'
                            ? 'Sattığınız YouTube videolarını ve müşterilerinizi takip edin'
                            : 'Minecraft mod allowlist GitHub README senkronizasyonunu yönetin'}
                    </p>
                </div>
            </div>

            {/* Segmented Tab Switcher */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '24px',
                backgroundColor: 'var(--bg-card)',
                padding: '4px',
                borderRadius: '12px',
                width: 'fit-content',
                border: '1px solid var(--border-color)'
            }}>
                <button
                    type="button"
                    onClick={() => setActiveMainTab('videos')}
                    style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        backgroundColor: activeMainTab === 'videos' ? 'var(--accent-purple)' : 'transparent',
                        color: activeMainTab === 'videos' ? '#fff' : 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: '13px'
                    }}
                >
                    YouTube Videoları ({videos.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveMainTab('mods')}
                    style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        backgroundColor: activeMainTab === 'mods' ? 'var(--accent-purple)' : 'transparent',
                        color: activeMainTab === 'mods' ? '#fff' : 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: '13px'
                    }}
                >
                    Modlar ({mods.length})
                </button>
            </div>

            {modToast && (
                <div style={{
                    padding: '10px 16px',
                    marginBottom: '16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(92, 62, 240, 0.2)',
                    border: '1px solid rgba(92, 62, 240, 0.4)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <CheckCircle2 size={16} style={{ color: '#4ade80' }} />
                    {modToast}
                </div>
            )}

            {/* TAB 1: YOUTUBE VIDEOLARI */}
            {activeMainTab === 'videos' && (
                <>
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
                                connectedModCount={modsByVideo[video.id]?.length || 0}
                                onClick={() => setSelectedVideo(video)}
                                onDelete={handleDeleteVideo}
                                onUpdateVideo={handleUpdateVideo}
                                onUpdateTitle={handleUpdateTitle}
                            />
                        ))}
                    </div>

                    {filteredVideos.length === 0 && (
                        <div className={styles.emptyState}>
                            {searchTerm ? 'Aramanıza uygun video bulunamadı.' : 'Henüz video eklenmemiş. Yukarıdan YouTube linkleri yapıştırın.'}
                        </div>
                    )}
                </>
            )}

            {/* TAB 2: MODLAR */}
            {activeMainTab === 'mods' && (
                <>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '16px',
                        marginBottom: '24px',
                        flexWrap: 'wrap'
                    }}>
                        <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '280px' }}>
                            <div className={styles.searchContainer} style={{ flex: 1 }}>
                                <Search className={styles.searchIcon} size={18} />
                                <input
                                    type="text"
                                    placeholder="Mod ara (ID, ad, repo)..."
                                    className={styles.searchInput}
                                    value={modSearchTerm}
                                    onChange={(e) => setModSearchTerm(e.target.value)}
                                />
                            </div>

                            <select
                                value={modStatusFilter}
                                onChange={(e) => setModStatusFilter(e.target.value as 'all' | 'active' | 'passive')}
                                style={{
                                    padding: '10px 14px',
                                    backgroundColor: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="all">Tüm Durumlar</option>
                                <option value="active">Yalnızca Aktif</option>
                                <option value="passive">Yalnızca Pasif</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await authenticatedFetch('/api/mods/global-backfill', { method: 'POST' });
                                        const data = await res.json();
                                        if (res.ok) {
                                            alert(data.message || 'Global Blume UUID senkronizasyonu kuyruğa alındı.');
                                        } else {
                                            alert(data.error || 'Backfill işlemi başarısız oldu.');
                                        }
                                    } catch (err) {
                                        alert('Backfill isteği sırasında ağ hatası oluştu.');
                                    }
                                }}
                                className="btn-secondary"
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                                title="Mevcut tüm aktif modların allowlist'ine Global Blume UUID'sini senkronize eder"
                            >
                                <Globe size={16} /> Global Blume Backfill
                            </button>

                            <button
                                onClick={() => setIsAddModModalOpen(true)}
                                className="btn-primary"
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Plus size={16} /> Yeni Mod Projesi
                            </button>
                        </div>
                    </div>

                    {/* Mod Cards Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '16px'
                    }}>
                        {filteredMods.map((m) => {
                            const stats = modStats[m.id] || { videoCount: 0, youtuberCount: 0 };
                            const isSyncingThis = syncingModId === m.id;

                            return (
                                <div
                                    key={m.id}
                                    style={{
                                        backgroundColor: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        padding: '18px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        transition: 'transform 0.2s, border-color 0.2s',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setSelectedModForDetail(m)}
                                >
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {m.displayName}
                                                </h3>
                                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                    {m.modKey}
                                                </span>
                                            </div>

                                            <span style={{
                                                fontSize: '11px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                backgroundColor: m.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                color: m.isActive ? '#4ade80' : 'var(--accent-red)',
                                                fontWeight: 500
                                            }}>
                                                {m.isActive ? 'Aktif' : 'Pasif'}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '12px', color: 'var(--accent-blue)', marginBottom: '12px' }}>
                                            <a
                                                href={`https://github.com/${m.githubOwner}/${m.githubRepository}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                                            >
                                                {m.githubOwner}/{m.githubRepository} <ExternalLink size={11} />
                                            </a>
                                        </div>

                                        <div style={{
                                            display: 'flex',
                                            gap: '12px',
                                            fontSize: '12px',
                                            color: 'var(--text-secondary)',
                                            padding: '8px 0',
                                            borderTop: '1px solid rgba(255,255,255,0.05)',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            marginBottom: '14px'
                                        }}>
                                            <span><strong>{stats.videoCount}</strong> Video Bağlı</span>
                                            <span>•</span>
                                            <span><strong>{stats.youtuberCount}</strong> Yetkili YouTuber</span>
                                        </div>

                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                            Son Sync: {m.lastSuccessfulSyncAt
                                                ? format(new Date(m.lastSuccessfulSyncAt), 'd MMM yyyy HH:mm', { locale: tr })
                                                : 'Henüz yapılmadı'}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedModForDetail(m);
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-color)',
                                                color: 'var(--text-primary)',
                                                fontSize: '12px',
                                                fontWeight: 500
                                            }}
                                        >
                                            Detay
                                        </button>

                                        <button
                                            type="button"
                                            onClick={(e) => handleQuickSyncMod(m.id, e)}
                                            disabled={isSyncingThis}
                                            className="btn-primary"
                                            style={{
                                                padding: '8px 14px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <RefreshCw size={12} className={isSyncingThis ? 'spin' : ''} />
                                            {isSyncingThis ? 'Senkronize Ediliyor...' : 'Şimdi Senkronize Et'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredMods.length === 0 && (
                        <div className={styles.emptyState}>
                            {modSearchTerm ? 'Aramanıza uygun mod bulunamadı.' : 'Henüz mod eklenmemiş. "Yeni Mod Ekle" butonuna basarak ilk modu oluşturabilirsiniz.'}
                        </div>
                    )}
                </>
            )}

            {/* Modals */}
            {selectedVideo && (
                <VideoDetailModal
                    isOpen={!!selectedVideo}
                    onClose={() => setSelectedVideo(null)}
                    video={selectedVideo}
                    assignments={assignmentsByVideo[selectedVideo.id] || []}
                />
            )}

            {isAddModModalOpen && (
                <ModModal
                    isOpen={isAddModModalOpen}
                    onClose={() => setIsAddModModalOpen(false)}
                    onSuccess={() => {
                        showModToast('Mod başarıyla oluşturuldu.');
                    }}
                />
            )}

            {selectedModForDetail && (
                <ModDetailModal
                    isOpen={!!selectedModForDetail}
                    onClose={() => setSelectedModForDetail(null)}
                    mod={selectedModForDetail}
                    onModUpdated={() => {
                        // Triggers snapshot update
                    }}
                />
            )}
        </div>
    );
}
