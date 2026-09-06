'use client';

import React, { useState } from 'react';
import {
    X,
    ExternalLink,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    Trash2,
    RotateCcw,
    Loader2
} from 'lucide-react';
import { ModProject, YoutuberModAccess } from '@/lib/mods/types';
import { useAuth } from '@/lib/auth-context';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface YoutuberModAccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    mod: ModProject;
    youtuberId: string;
    youtuberName: string;
    access: YoutuberModAccess | null;
    activePlayerCount: number;
    onAccessChanged: () => void;
}

export default function YoutuberModAccessModal({
    isOpen,
    onClose,
    mod,
    youtuberId,
    youtuberName,
    access,
    activePlayerCount,
    onAccessChanged
}: YoutuberModAccessModalProps) {
    const { user } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isRevoking, setIsRevoking] = useState(false);
    const [isGranting, setIsGranting] = useState(false);
    const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    if (!isOpen) return null;

    const isActive = access?.status === 'ACTIVE';
    const isRevoked = access?.status === 'REVOKED';
    const hasAccess = !!access;

    const githubRepoUrl = `https://github.com/${mod.githubOwner}/${mod.githubRepository}`;

    // Action: Sync Now
    const handleSyncNow = async () => {
        if (!user || isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await fetch(`/api/mods/${mod.id}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
                body: JSON.stringify({ triggerType: 'MANUAL_SYNC' })
            });
            const json = await res.json();
            if (res.ok) {
                showToast(json.data?.message || 'Senkronizasyon tamamlandı.');
                onAccessChanged();
            } else {
                showToast(`Hata: ${json.error}`);
            }
        } catch {
            showToast('Ağ hatası.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Action: Revoke Access
    const handleRevoke = async () => {
        if (!user || isRevoking) return;
        setIsRevoking(true);
        try {
            const res = await fetch(`/api/mods/${mod.id}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
                body: JSON.stringify({ youtuberId, action: 'revoke' })
            });
            const json = await res.json();
            if (res.ok) {
                showToast(`${youtuberName} erişimi kaldırıldı.`);
                setShowRevokeConfirm(false);
                onAccessChanged();
            } else {
                showToast(`Hata: ${json.error}`);
            }
        } catch {
            showToast('Erişim kaldırılırken hata oluştu.');
        } finally {
            setIsRevoking(false);
        }
    };

    // Action: Grant / Regrant Access
    const handleGrant = async (isRegrant: boolean) => {
        if (!user || isGranting) return;
        setIsGranting(true);
        try {
            const res = await fetch(`/api/mods/${mod.id}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
                body: JSON.stringify({ youtuberId, action: isRegrant ? 'regrant' : 'grant' })
            });
            const json = await res.json();
            if (res.ok) {
                showToast(`${youtuberName} erişimi verildi.`);
                onAccessChanged();
            } else {
                showToast(`Hata: ${json.error}`);
            }
        } catch {
            showToast('İşlem başarısız oldu.');
        } finally {
            setIsGranting(false);
        }
    };

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
                zIndex: 1200,
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
                    maxWidth: '480px',
                    padding: '24px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    color: 'var(--text-primary)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Minecraft Mod Erişimi Yönetimi</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {youtuberName} için {mod.displayName} yetkisi
                        </p>
                    </div>
                    <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
                        <X size={18} />
                    </button>
                </div>

                {toastMessage && (
                    <div style={{
                        padding: '8px 12px',
                        marginBottom: '16px',
                        backgroundColor: 'rgba(92, 62, 240, 0.2)',
                        border: '1px solid rgba(92, 62, 240, 0.3)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <CheckCircle2 size={14} style={{ color: '#4ade80' }} />
                        {toastMessage}
                    </div>
                )}

                {/* Details list */}
                <div style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '16px',
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    marginBottom: '20px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Mod:</span>
                        <strong>{mod.displayName} ({mod.modKey})</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Erişim Durumu:</span>
                        <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: isActive
                                ? 'rgba(34, 197, 94, 0.15)'
                                : isRevoked
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : 'rgba(255, 255, 255, 0.05)',
                            color: isActive ? '#4ade80' : isRevoked ? 'var(--accent-red)' : 'var(--text-secondary)',
                            fontWeight: 600
                        }}>
                            {isActive ? 'Aktif' : isRevoked ? 'Manuel Kaldırıldı' : 'Tanımsız'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Erişim Kaynağı:</span>
                        <span>
                            {access?.grantType === 'VIDEO_ASSIGNMENT'
                                ? 'Takvim video ataması'
                                : access?.grantType === 'MANUAL'
                                    ? 'Manuel yetkilendirme'
                                    : 'Yok'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Aktif Minecraft Oyuncusu:</span>
                        <span>
                            <strong>{activePlayerCount}</strong> {activePlayerCount === 0 && <span style={{ color: 'var(--accent-yellow)', fontSize: '11px' }}>(Erişim için oyuncu ekleyin)</span>}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Son Başarılı Sync:</span>
                        <span>
                            {mod.lastSuccessfulSyncAt
                                ? format(new Date(mod.lastSuccessfulSyncAt), 'd MMM yyyy HH:mm', { locale: tr })
                                : 'Henüz yapılmadı'}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                            href={githubRepoUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                flex: 1,
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <ExternalLink size={13} />
                            GitHub&apos;da Aç
                        </a>

                        <button
                            onClick={handleSyncNow}
                            disabled={isSyncing}
                            className="btn-primary"
                            style={{
                                flex: 1,
                                padding: '9px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            {isSyncing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                            Şimdi Senkronize Et
                        </button>
                    </div>

                    {isActive && (
                        <button
                            onClick={() => setShowRevokeConfirm(true)}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: 'var(--accent-red)',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                backgroundColor: 'rgba(239, 68, 68, 0.05)'
                            }}
                        >
                            <Trash2 size={13} />
                            Erişimi Kaldır
                        </button>
                    )}

                    {isRevoked && (
                        <button
                            onClick={() => handleGrant(true)}
                            disabled={isGranting}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--accent-purple)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                backgroundColor: 'rgba(92, 62, 240, 0.15)'
                            }}
                        >
                            {isGranting ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />}
                            Yeniden Ekle
                        </button>
                    )}

                    {!hasAccess && (
                        <button
                            onClick={() => handleGrant(false)}
                            disabled={isGranting}
                            className="btn-primary"
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                        >
                            {isGranting ? <Loader2 size={13} className="spin" /> : 'Erişim Tanımla'}
                        </button>
                    )}
                </div>

                {/* Revoke Confirmation Dialog */}
                {showRevokeConfirm && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        zIndex: 1300,
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
                                <h4 style={{ fontSize: '15px', fontWeight: 600 }}>Erişim Kaldırma Onayı</h4>
                            </div>
                            <p style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                <strong>{youtuberName}</strong>’in <strong>{mod.displayName}</strong> erişimi kaldırılacak ve BlumeCore tarafından yönetilen UUID’leri README’den çıkarılacak.
                                <br /><br />
                                <em>Not: Legacy bölümde bulunan UUID’ler otomatik silinmeyecektir.</em>
                                <br /><br />
                                Devam etmek istiyor musunuz?
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    onClick={() => setShowRevokeConfirm(false)}
                                    style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={handleRevoke}
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
        </div>
    );
}
