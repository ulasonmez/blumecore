'use client';

import React, { useState, useEffect } from 'react';
import {
    X,
    ExternalLink,
    RefreshCw,
    ShieldAlert,
    CheckCircle2,
    Clock,
    UserPlus,
    Trash2,
    RotateCcw,
    Loader2,
    Users,
    FileText,
    AlertTriangle,
    Search,
    ChevronDown,
    Eye,
    EyeOff
} from 'lucide-react';
import { ModProject, YoutuberAccessSummary, LegacyUuidInfo } from '@/lib/mods/types';
import { useAuth } from '@/lib/auth-context';
import { authenticatedFetch } from '@/lib/api-client';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface ModDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    mod: ModProject;
    onModUpdated?: () => void;
}

export default function ModDetailModal({
    isOpen,
    onClose,
    mod,
    onModUpdated
}: ModDetailModalProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'general' | 'youtubers' | 'legacy'>('general');

    // Data states
    const [accessList, setAccessList] = useState<YoutuberAccessSummary[]>([]);
    const [legacyUuids, setLegacyUuids] = useState<LegacyUuidInfo[]>([]);
    const [allYoutubers, setAllYoutubers] = useState<{ id: string; name: string }[]>([]);

    // Loading states
    const [isLoadingAccess, setIsLoadingAccess] = useState(false);
    const [isLoadingLegacy, setIsLoadingLegacy] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Drift state
    const [isCheckingDrift, setIsCheckingDrift] = useState(false);
    const [driftResult, setDriftResult] = useState<{
        isDrifted: boolean;
        isMalformed: boolean;
        error?: string;
        writtenUuidCount: number;
    } | null>(null);

    // Manual grant modal state
    const [isAddYoutuberOpen, setIsAddYoutuberOpen] = useState(false);
    const [selectedYoutuberId, setSelectedYoutuberId] = useState('');
    const [youtuberSearchTerm, setYoutuberSearchTerm] = useState('');
    const [isYoutuberDropdownOpen, setIsYoutuberDropdownOpen] = useState(false);
    const [isGranting, setIsGranting] = useState(false);
    const [showRevoked, setShowRevoked] = useState(false);

    // Revoke confirm state
    const [revokingTarget, setRevokingTarget] = useState<YoutuberAccessSummary | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);

    // Sync preview modal state
    const [isSyncPreviewOpen, setIsSyncPreviewOpen] = useState(false);

    // Toast / Feedback message
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // Load authorized YouTubers
    const loadAccessList = async () => {
        if (!user) return;
        setIsLoadingAccess(true);
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/access`);
            const json = await res.json();
            if (json.data) setAccessList(json.data);
        } catch (err: unknown) {
            console.error('Error loading access list:', err);
        } finally {
            setIsLoadingAccess(false);
        }
    };

    // Load legacy UUIDs
    const loadLegacyUuids = async () => {
        if (!user) return;
        setIsLoadingLegacy(true);
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/legacy-uuids`);
            const json = await res.json();
            if (json.data) setLegacyUuids(json.data);
        } catch (err: unknown) {
            console.error('Error loading legacy uuids:', err);
        } finally {
            setIsLoadingLegacy(false);
        }
    };

    // Load available YouTubers for manual adding
    const loadAllYoutubers = async () => {
        if (!user) return;
        try {
            const res = await authenticatedFetch('/api/youtubers');
            const json = await res.json();
            if (json.data) setAllYoutubers(json.data);
        } catch {
            // fallback
        }
    };

    useEffect(() => {
        if (isOpen && user) {
            loadAccessList();
            loadLegacyUuids();
            loadAllYoutubers();
            setDriftResult(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, mod.id, user]);

    // Handle Manual Sync Execution
    const handleSyncNow = async () => {
        if (!user || isSyncing) return;
        setIsSyncing(true);
        setIsSyncPreviewOpen(false);
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ triggerType: 'MANUAL_SYNC' })
            });
            const json = await res.json();
            if (!res.ok) {
                showToast(`Hata: ${json.error || 'Senkronizasyon başarısız'}`);
            } else {
                showToast(json.data?.message || 'Senkronizasyon tamamlandı.');
                setDriftResult(null);
                if (onModUpdated) onModUpdated();
                loadAccessList();
            }
        } catch {
            showToast('Ağ hatası oluştu.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Handle Drift Check
    const handleCheckDrift = async () => {
        if (!user || isCheckingDrift) return;
        setIsCheckingDrift(true);
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/drift-check`);
            const json = await res.json();
            if (json.data) {
                setDriftResult(json.data);
            } else {
                showToast(`Drift kontrolü başarısız: ${json.error}`);
            }
        } catch {
            showToast('Drift kontrolü sırasında hata oluştu.');
        } finally {
            setIsCheckingDrift(false);
        }
    };

    // Handle Grant Manual Access
    const handleGrantAccess = async () => {
        if (!user || !selectedYoutuberId || isGranting) return;
        setIsGranting(true);
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/access`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    youtuberId: selectedYoutuberId,
                    action: 'grant'
                })
            });
            const json = await res.json();
            if (res.ok) {
                showToast('YouTuber erişimi verildi ve senkronizasyon tetiklendi.');
                setIsAddYoutuberOpen(false);
                setSelectedYoutuberId('');
                setYoutuberSearchTerm('');
                setIsYoutuberDropdownOpen(false);
                loadAccessList();
                if (onModUpdated) onModUpdated();
            } else {
                showToast(`Hata: ${json.error}`);
            }
        } catch {
            showToast('Erişim verilirken hata oluştu.');
        } finally {
            setIsGranting(false);
        }
    };

    // Handle Revoke Access
    const handleRevokeConfirm = async () => {
        if (!user || !revokingTarget || isRevoking) return;
        setIsRevoking(true);
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/access`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    youtuberId: revokingTarget.access.youtuberId,
                    action: 'revoke'
                })
            });
            const json = await res.json();
            if (res.ok) {
                showToast(`${revokingTarget.youtuberName} erişimi kaldırıldı.`);
                setRevokingTarget(null);
                loadAccessList();
                if (onModUpdated) onModUpdated();
            } else {
                showToast(`Hata: ${json.error}`);
            }
        } catch {
            showToast('Erişim kaldırılırken hata oluştu.');
        } finally {
            setIsRevoking(false);
        }
    };

    // Handle Regrant Access
    const handleRegrant = async (target: YoutuberAccessSummary) => {
        if (!user) return;
        try {
            const res = await authenticatedFetch(`/api/mods/${mod.id}/access`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    youtuberId: target.access.youtuberId,
                    action: 'regrant'
                })
            });
            const json = await res.json();
            if (res.ok) {
                showToast(`${target.youtuberName} erişimi yeniden aktifleştirildi.`);
                loadAccessList();
                if (onModUpdated) onModUpdated();
            } else {
                showToast(`Hata: ${json.error}`);
            }
        } catch {
            showToast('Yeniden ekleme hatası.');
        }
    };

    if (!isOpen) return null;

    const githubRepoUrl = `https://github.com/${mod.githubOwner}/${mod.githubRepository}`;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '16px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '680px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 700 }}>{mod.displayName}</h2>
                            <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: mod.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: mod.isActive ? '#4ade80' : 'var(--accent-red)',
                                fontWeight: 500
                            }}>
                                {mod.isActive ? 'Aktif' : 'Pasif'}
                            </span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span>Mod ID: <strong>{mod.modKey}</strong></span>
                            <span>•</span>
                            <a
                                href={githubRepoUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                                {mod.githubOwner}/{mod.githubRepository} <ExternalLink size={12} />
                            </a>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ color: 'var(--text-secondary)', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '0 24px',
                    backgroundColor: 'rgba(255,255,255,0.01)'
                }}>
                    <button
                        onClick={() => setActiveTab('general')}
                        style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: activeTab === 'general' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'general' ? '2px solid var(--accent-purple)' : '2px solid transparent'
                        }}
                    >
                        Genel & Senkronizasyon
                    </button>
                    <button
                        onClick={() => setActiveTab('youtubers')}
                        style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: activeTab === 'youtubers' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'youtubers' ? '2px solid var(--accent-purple)' : '2px solid transparent'
                        }}
                    >
                        Yetkili YouTuber&apos;lar ({accessList.filter(a => a.access.status === 'ACTIVE').length})
                    </button>
                    <button
                        onClick={() => setActiveTab('legacy')}
                        style={{
                            padding: '12px 16px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: activeTab === 'legacy' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'legacy' ? '2px solid var(--accent-purple)' : '2px solid transparent'
                        }}
                    >
                        Legacy UUID&apos;ler ({legacyUuids.length})
                    </button>
                </div>

                {/* Toast message banner */}
                {toastMessage && (
                    <div style={{
                        padding: '8px 24px',
                        backgroundColor: 'rgba(92, 62, 240, 0.2)',
                        borderBottom: '1px solid rgba(92, 62, 240, 0.3)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <CheckCircle2 size={14} style={{ color: '#4ade80' }} />
                        {toastMessage}
                    </div>
                )}

                {/* Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {activeTab === 'general' && (
                        <div>
                            {/* Sync status card */}
                            <div style={{
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '20px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        GitHub README Durumu
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={handleCheckDrift}
                                            disabled={isCheckingDrift}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-color)',
                                                fontSize: '12px',
                                                color: 'var(--text-primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            {isCheckingDrift ? <Loader2 size={12} className="spin" /> : <Clock size={12} />}
                                            README&apos;yi Kontrol Et
                                        </button>

                                        <button
                                            onClick={() => setIsSyncPreviewOpen(true)}
                                            disabled={isSyncing}
                                            className="btn-primary"
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            {isSyncing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                                            Şimdi Senkronize Et
                                        </button>
                                    </div>
                                </div>

                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Son Başarılı Sync:</span>
                                        <strong style={{ color: 'var(--text-primary)' }}>
                                            {mod.lastSuccessfulSyncAt
                                                ? format(new Date(mod.lastSuccessfulSyncAt), 'd MMM yyyy HH:mm', { locale: tr })
                                                : 'Henüz yapılmadı'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Son Commit SHA:</span>
                                        <code style={{ color: 'var(--text-primary)' }}>
                                            {mod.lastSuccessfulCommitSha ? mod.lastSuccessfulCommitSha.slice(0, 7) : 'Yok'}
                                        </code>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Branch / Dosya:</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{mod.branch} / {mod.allowlistPath}</span>
                                    </div>
                                    <div>
                                        <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Sync Modu:</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{mod.syncMode}</span>
                                    </div>
                                </div>

                                {/* Drift result */}
                                {driftResult && (
                                    <div style={{
                                        marginTop: '16px',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        backgroundColor: driftResult.isDrifted ? 'rgba(234, 179, 8, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                        border: `1px solid ${driftResult.isDrifted ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                                        fontSize: '12px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: driftResult.isDrifted ? '#facc15' : '#4ade80' }}>
                                                {driftResult.isDrifted ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                                                {driftResult.isDrifted ? 'Farklılık (Drift) Tespit Edildi' : 'GitHub Dosyası BlumeCore ile Tam Uyumlu'}
                                            </div>
                                            {driftResult.isDrifted && (
                                                <button
                                                    onClick={handleSyncNow}
                                                    disabled={isSyncing}
                                                    className="btn-primary"
                                                    style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}
                                                >
                                                    Düzelt (Sync Now)
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>
                                            {driftResult.isDrifted
                                                ? 'Canlı README dosyasındaki managed bölüm, BlumeCore veritabanındaki aktif oyuncu listesinden farklı. Güncellemek için Düzelt butonunu kullanın.'
                                                : 'Tüm aktif YouTuber ve Minecraft oyuncuları README dosyasında beklenen sırada yer alıyor.'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Description if any */}
                            {mod.description && (
                                <div style={{ marginBottom: '20px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Açıklama:</span>
                                    <p style={{ fontSize: '13px', marginTop: '4px' }}>{mod.description}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'youtubers' && (() => {
                        const revokedCount = accessList.filter(a => a.access.status === 'REVOKED').length;
                        const displayedAccessList = showRevoked
                            ? accessList
                            : accessList.filter(a => a.access.status === 'ACTIVE');

                        return (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        Bu mod için tanımlanmış YouTuber erişimleri:
                                    </span>
                                    {revokedCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowRevoked(prev => !prev)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                color: showRevoked ? 'var(--accent-purple)' : 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                            title={showRevoked ? 'Erişimi kaldırılanları gizle' : 'Erişimi kaldırılanları göster'}
                                        >
                                            {showRevoked ? <EyeOff size={12} /> : <Eye size={12} />}
                                            {showRevoked ? 'Kaldırılanları Gizle' : `Kaldırılanları Göster (${revokedCount})`}
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => setIsAddYoutuberOpen(true)}
                                    className="btn-primary"
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <UserPlus size={13} />
                                    YouTuber Ekle
                                </button>
                            </div>

                            {/* Manual Add Form */}
                            {isAddYoutuberOpen && (
                                <div style={{
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    marginBottom: '16px'
                                }}>
                                    <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>YouTuber&apos;a Manuel Mod Erişimi Tanımla</h4>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    backgroundColor: 'var(--bg-color)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '6px',
                                                    padding: '0 10px',
                                                    gap: '8px'
                                                }}
                                            >
                                                <Search size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                                <input
                                                    type="text"
                                                    placeholder="YouTuber ara veya seç..."
                                                    value={isYoutuberDropdownOpen ? youtuberSearchTerm : (allYoutubers.find(y => y.id === selectedYoutuberId)?.name || '')}
                                                    onChange={(e) => {
                                                        setYoutuberSearchTerm(e.target.value);
                                                        setIsYoutuberDropdownOpen(true);
                                                        if (!e.target.value) {
                                                            setSelectedYoutuberId('');
                                                        }
                                                    }}
                                                    onFocus={() => {
                                                        setIsYoutuberDropdownOpen(true);
                                                        if (selectedYoutuberId) {
                                                            const current = allYoutubers.find(y => y.id === selectedYoutuberId);
                                                            if (current) setYoutuberSearchTerm(current.name);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 0',
                                                        backgroundColor: 'transparent',
                                                        border: 'none',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '13px',
                                                        outline: 'none'
                                                    }}
                                                />
                                                <ChevronDown
                                                    size={14}
                                                    style={{
                                                        color: 'var(--text-secondary)',
                                                        cursor: 'pointer',
                                                        transform: isYoutuberDropdownOpen ? 'rotate(180deg)' : 'none',
                                                        transition: 'transform 0.15s ease'
                                                    }}
                                                    onClick={() => setIsYoutuberDropdownOpen(prev => !prev)}
                                                />
                                            </div>

                                            {isYoutuberDropdownOpen && (
                                                <>
                                                    <div
                                                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 19 }}
                                                        onClick={() => {
                                                            setIsYoutuberDropdownOpen(false);
                                                            setYoutuberSearchTerm('');
                                                        }}
                                                    />
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        right: 0,
                                                        marginTop: '4px',
                                                        backgroundColor: 'var(--bg-card)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '6px',
                                                        maxHeight: '180px',
                                                        overflowY: 'auto',
                                                        zIndex: 20,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                                                    }}>
                                                        {allYoutubers.filter(y => y.name.toLowerCase().includes(youtuberSearchTerm.toLowerCase())).length === 0 ? (
                                                            <div style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center' }}>
                                                                Eşleşen YouTuber bulunamadı.
                                                            </div>
                                                        ) : (
                                                            allYoutubers
                                                                .filter(y => y.name.toLowerCase().includes(youtuberSearchTerm.toLowerCase()))
                                                                .map(y => {
                                                                    const isSelected = selectedYoutuberId === y.id;
                                                                    return (
                                                                        <div
                                                                            key={y.id}
                                                                            onClick={() => {
                                                                                setSelectedYoutuberId(y.id);
                                                                                setIsYoutuberDropdownOpen(false);
                                                                                setYoutuberSearchTerm('');
                                                                            }}
                                                                            style={{
                                                                                padding: '8px 12px',
                                                                                cursor: 'pointer',
                                                                                fontSize: '12px',
                                                                                color: isSelected ? 'var(--accent-purple)' : 'var(--text-primary)',
                                                                                backgroundColor: isSelected ? 'rgba(92, 62, 240, 0.15)' : 'transparent',
                                                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                transition: 'background-color 0.15s'
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                                                            }}
                                                                        >
                                                                            <span>{y.name}</span>
                                                                            {isSelected && <CheckCircle2 size={13} style={{ color: 'var(--accent-purple)' }} />}
                                                                        </div>
                                                                    );
                                                                })
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleGrantAccess}
                                            disabled={!selectedYoutuberId || isGranting}
                                            className="btn-primary"
                                            style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '6px', height: '36px', whiteSpace: 'nowrap' }}
                                        >
                                            {isGranting ? 'Ekleniyor...' : 'Erişim Ver'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsAddYoutuberOpen(false);
                                                setSelectedYoutuberId('');
                                                setYoutuberSearchTerm('');
                                                setIsYoutuberDropdownOpen(false);
                                            }}
                                            style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)', height: '36px' }}
                                        >
                                            İptal
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isLoadingAccess ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                                    <Loader2 size={24} className="spin" />
                                </div>
                            ) : displayedAccessList.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                    {accessList.length === 0
                                        ? 'Bu moda henüz yetkili bir YouTuber tanımlanmamış.'
                                        : 'Aktif yetkili YouTuber bulunmamaktadır.'}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {displayedAccessList.map((item) => {
                                        const isRevoked = item.access.status === 'REVOKED';
                                        return (
                                            <div
                                                key={item.access.id}
                                                style={{
                                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '8px',
                                                    padding: '12px 16px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{item.youtuberName}</span>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            backgroundColor: isRevoked ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                                            color: isRevoked ? 'var(--accent-red)' : '#4ade80'
                                                        }}>
                                                            {isRevoked ? 'Manuel Kaldırıldı' : 'Aktif'}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                            ({item.access.grantType === 'VIDEO_ASSIGNMENT' ? 'Takvim Ataması' : 'Manuel'})
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                        {item.activePlayerCount} aktif Minecraft oyuncusu
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {isRevoked ? (
                                                        <button
                                                            onClick={() => handleRegrant(item)}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--border-color)',
                                                                color: 'var(--text-primary)',
                                                                fontSize: '12px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <RotateCcw size={12} /> Yeniden Ekle
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setRevokingTarget(item)}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                color: 'var(--accent-red)',
                                                                fontSize: '12px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <Trash2 size={12} /> Erişimi Kaldır
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Revoke confirmation dialog */}
                            {revokingTarget && (
                                <div style={{
                                    position: 'fixed',
                                    inset: 0,
                                    backgroundColor: 'rgba(0,0,0,0.8)',
                                    zIndex: 1100,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '16px'
                                }}>
                                    <div style={{
                                        backgroundColor: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        padding: '20px',
                                        maxWidth: '440px',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', marginBottom: '12px' }}>
                                            <AlertTriangle size={20} />
                                            <h4 style={{ fontSize: '15px', fontWeight: 600 }}>Mod Erişimi Kaldırılıyor</h4>
                                        </div>
                                        <p style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                            <strong>{revokingTarget.youtuberName}</strong>’in <strong>{mod.displayName}</strong> erişimi kaldırılacak ve BlumeCore tarafından yönetilen UUID’leri README’den çıkarılacak.
                                            <br /><br />
                                            <em>Not: Legacy bölümde bulunan UUID’ler otomatik silinmeyecektir.</em>
                                            <br /><br />
                                            Devam etmek istiyor musunuz?
                                        </p>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button
                                                onClick={() => setRevokingTarget(null)}
                                                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                                            >
                                                Vazgeç
                                            </button>
                                            <button
                                                onClick={handleRevokeConfirm}
                                                disabled={isRevoking}
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius: '6px',
                                                    backgroundColor: 'var(--accent-red)',
                                                    color: '#fff',
                                                    fontSize: '12px',
                                                    fontWeight: 600
                                                }}
                                            >
                                                {isRevoking ? 'Kaldırılıyor...' : 'Evet, Erişimi Kaldır'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })()}

                    {activeTab === 'legacy' && (
                        <div>
                            {/* Safety Notice */}
                            <div style={{
                                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                borderRadius: '8px',
                                padding: '12px',
                                marginBottom: '16px',
                                fontSize: '12px',
                                color: '#facc15'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '4px' }}>
                                    <ShieldAlert size={16} /> Legacy UUID Güvenlik Bilgisi
                                </div>
                                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    Bu oyuncuların UUID&apos;leri BlumeCore tarafından yönetilmeyen eski README bölümünde yer almaktadır. BlumeCore erişimi kaldırılmış olsa bile eski satır silinmeden mod erişimi devam edebilir. Bu kayıtlar BlumeCore tarafından otomatik ezilmez veya silinmez.
                                </div>
                            </div>

                            {isLoadingLegacy ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                                    <Loader2 size={24} className="spin" />
                                </div>
                            ) : legacyUuids.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    <FileText size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                    Dosyada yönetilmeyen eski (legacy) UUID kaydı bulunamadı.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {legacyUuids.map((item, idx) => (
                                        <div
                                            key={`${item.uuid}-${idx}`}
                                            style={{
                                                backgroundColor: 'rgba(255,255,255,0.02)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                padding: '12px 16px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <code style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{item.uuid}</code>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    {item.matchedPlayerUsername ? (
                                                        <span>Eşleşen Oyuncu: <strong style={{ color: 'var(--text-primary)' }}>{item.matchedPlayerUsername}</strong></span>
                                                    ) : (
                                                        <span style={{ fontStyle: 'italic' }}>Bilinmeyen Oyuncu (BlumeCore havuzunda yok)</span>
                                                    )}
                                                    {item.matchedYoutuberName && (
                                                        <span> • YouTuber: <strong style={{ color: 'var(--text-primary)' }}>{item.matchedYoutuberName}</strong></span>
                                                    )}
                                                </div>
                                            </div>

                                            {item.isDuplicateInLegacy && (
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: 'rgba(239,68,68,0.15)',
                                                    color: 'var(--accent-red)'
                                                }}>
                                                    Legacy Bölümde Mükerrer
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Sync Preview Confirmation Modal */}
                {isSyncPreviewOpen && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1100,
                            padding: '20px'
                        }}
                        onClick={() => setIsSyncPreviewOpen(false)}
                    >
                        <div
                            style={{
                                backgroundColor: 'var(--card-bg, #18181b)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '16px',
                                width: '100%',
                                maxWidth: '640px',
                                maxHeight: '90vh',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <RefreshCw size={18} style={{ color: 'var(--accent-purple)' }} />
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        GitHub Senkronizasyon Önizlemesi
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setIsSyncPreviewOpen(false)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{
                                    backgroundColor: 'rgba(92, 62, 240, 0.08)',
                                    border: '1px solid rgba(92, 62, 240, 0.25)',
                                    borderRadius: '10px',
                                    padding: '14px 16px',
                                    fontSize: '13px'
                                }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        Hedef Repository ve Dosya:
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div>Repository: <strong style={{ color: 'var(--text-primary)' }}>{mod.githubOwner}/{mod.githubRepository}</strong></div>
                                        <div>Branch: <strong style={{ color: 'var(--text-primary)' }}>{mod.branch}</strong></div>
                                        <div>Dosya Yolu: <strong style={{ color: 'var(--text-primary)' }}>{mod.allowlistPath}</strong></div>
                                        <div>Mod Adı: <strong style={{ color: 'var(--text-primary)' }}>{mod.displayName}</strong></div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                    <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Aktif YouTuber</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-purple)' }}>
                                            {accessList.filter((a) => a.access.status === 'ACTIVE').length}
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Arzu Edilen UUID</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-green)' }}>
                                            {accessList
                                                .filter((a) => a.access.status === 'ACTIVE')
                                                .reduce((sum, a) => sum + a.activePlayerCount, 0)}
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Legacy UUID</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-yellow)' }}>
                                            {legacyUuids.length}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                        Yazılacak Managed README Bloğu (Önizleme):
                                    </div>
                                    <pre style={{
                                        backgroundColor: '#0d1117',
                                        color: '#c9d1d9',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontFamily: 'monospace',
                                        maxHeight: '160px',
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        border: '1px solid #30363d'
                                    }}>
{`<!-- BLUMECORE-MANAGED-START -->
<!-- Bu bölüm BlumeCore tarafından otomatik üretilmiştir. Lütfen elle değiştirmeyiniz. -->
### Yetkili YouTuber ve Oyuncu Listesi

` + accessList
    .filter((a) => a.access.status === 'ACTIVE' && a.players.length > 0)
    .map((a) => `<!-- BLUMECORE-YOUTUBER:${a.access.youtuberId}:START -->\n#### ${a.youtuberName}\n` + a.players.map((p) => `- ${p.uuid} # ${p.username}`).join('\n') + `\n<!-- BLUMECORE-YOUTUBER:${a.access.youtuberId}:END -->`)
    .join('\n\n') + `\n<!-- BLUMECORE-MANAGED-END -->`}
                                    </pre>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'center',
                                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                                    border: '1px solid rgba(234, 179, 8, 0.3)',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    fontSize: '12px',
                                    color: 'var(--accent-yellow)'
                                }}>
                                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                                    <span>
                                        Bu işlem GitHub REST Contents API üzerinden <code>blumeplugins/{mod.githubRepository}</code> reposuna doğrudan commit atacaktır. Unmanaged legacy satırlar korunur.
                                    </span>
                                </div>
                            </div>

                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    onClick={() => setIsSyncPreviewOpen(false)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        fontSize: '13px',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={handleSyncNow}
                                    disabled={isSyncing}
                                    className="btn-primary"
                                    style={{
                                        padding: '8px 20px',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {isSyncing ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                                    Onayla ve GitHub&apos;a Commit Et
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            fontSize: '13px',
                            color: 'var(--text-secondary)'
                        }}
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    );
}
