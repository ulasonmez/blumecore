'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2, ExternalLink, ShieldCheck, FileCode } from 'lucide-react';
import { ModProject } from '@/lib/mods/types';
import { useAuth } from '@/lib/auth-context';

interface ModModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (mod: ModProject) => void;
    initialMod?: ModProject | null;
}

interface TestResultState {
    success: boolean;
    repositoryFound: boolean;
    branchFound: boolean;
    fileFound: boolean;
    fileSha?: string;
    writePermissionNote: string;
    isManagedSectionPresent?: boolean;
    hasMalformedMarkers?: boolean;
    malformedReason?: string | null;
    legacyUuidCount?: number;
    managedUuidCount?: number;
    error?: string;
}

export default function ModModal({
    isOpen,
    onClose,
    onSuccess,
    initialMod
}: ModModalProps) {
    const { user } = useAuth();

    const [modKey, setModKey] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [description, setDescription] = useState('');
    const [githubOwner, setGithubOwner] = useState('blumeplugins');
    const [githubRepository, setGithubRepository] = useState('');
    const [branch, setBranch] = useState('main');
    const [allowlistPath, setAllowlistPath] = useState('README.md');
    const [isActive, setIsActive] = useState(true);

    const [isRepoTouched, setIsRepoTouched] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResultState | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (initialMod) {
            setModKey(initialMod.modKey);
            setDisplayName(initialMod.displayName);
            setDescription(initialMod.description || '');
            setGithubOwner(initialMod.githubOwner);
            setGithubRepository(initialMod.githubRepository);
            setBranch(initialMod.branch);
            setAllowlistPath(initialMod.allowlistPath);
            setIsActive(initialMod.isActive);
            setIsRepoTouched(true);
        } else {
            setModKey('');
            setDisplayName('');
            setDescription('');
            setGithubOwner('blumeplugins');
            setGithubRepository('');
            setBranch('main');
            setAllowlistPath('README.md');
            setIsActive(true);
            setIsRepoTouched(false);
        }
        setTestResult(null);
        setFormError(null);
    }, [initialMod, isOpen]);

    const handleModKeyChange = (val: string) => {
        setModKey(val);
        if (!isRepoTouched) {
            setGithubRepository(val.trim());
        }
    };

    const effectiveOwner = githubOwner.trim() || 'blumeplugins';
    const effectiveRepo = githubRepository.trim() || modKey.trim();
    const effectiveBranch = branch.trim() || 'main';
    const effectivePath = allowlistPath.trim() || 'README.md';

    const previewUrl = effectiveRepo
        ? `https://github.com/${effectiveOwner}/${effectiveRepo}`
        : '';
    const rawPreviewUrl = effectiveRepo
        ? `https://raw.githubusercontent.com/${effectiveOwner}/${effectiveRepo}/refs/heads/${effectiveBranch}/${effectivePath}`
        : '';

    const handleTestConnection = async () => {
        if (!effectiveRepo || !user) return;
        setIsTesting(true);
        setTestResult(null);
        setFormError(null);

        try {
            const res = await fetch('/api/mods/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    githubOwner: effectiveOwner,
                    githubRepository: effectiveRepo,
                    branch: effectiveBranch,
                    allowlistPath: effectivePath
                })
            });
            const json = await res.json();
            if (json.data) {
                setTestResult(json.data);
            } else {
                setTestResult({
                    success: false,
                    repositoryFound: false,
                    branchFound: false,
                    fileFound: false,
                    writePermissionNote: 'Bağlantı testi başarısız.',
                    error: json.error || 'Bilinmeyen hata'
                });
            }
        } catch (err: unknown) {
            setTestResult({
                success: false,
                repositoryFound: false,
                branchFound: false,
                fileFound: false,
                writePermissionNote: 'Ağ hatası.',
                error: err instanceof Error ? err.message : 'Bağlantı hatası'
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isSaving) return;

        if (!modKey.trim()) {
            setFormError('Mod ID gereklidir.');
            return;
        }
        if (!displayName.trim()) {
            setFormError('Görünen Ad gereklidir.');
            return;
        }

        setIsSaving(true);
        setFormError(null);

        try {
            const url = initialMod ? `/api/mods/${initialMod.id}` : '/api/mods';
            const method = initialMod ? 'PATCH' : 'POST';

            const payload = initialMod
                ? {
                    displayName: displayName.trim(),
                    description: description.trim(),
                    branch: effectiveBranch,
                    allowlistPath: effectivePath,
                    isActive
                }
                : {
                    modKey: modKey.trim(),
                    displayName: displayName.trim(),
                    description: description.trim(),
                    githubOwner: effectiveOwner,
                    githubRepository: effectiveRepo,
                    branch: effectiveBranch,
                    allowlistPath: effectivePath,
                    isActive
                };

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.uid
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Mod kaydedilemedi.');
            }

            onSuccess(json.data);
            onClose();
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : 'Kaydedilirken hata oluştu.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
        }} onClick={onClose}>
            <div
                style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '560px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: '24px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    color: 'var(--text-primary)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>
                            {initialMod ? 'Mod Projesini Düzenle' : 'Yeni Mod Projesi Ekle'}
                        </h2>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            GitHub README Minecraft allowlist senkronizasyon ayarları
                        </p>
                    </div>
                    <button onClick={onClose} style={{ color: 'var(--text-secondary)', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSave}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Mod ID (modKey) *
                            </label>
                            <input
                                type="text"
                                value={modKey}
                                onChange={(e) => handleModKeyChange(e.target.value)}
                                placeholder="Örn: DyingIsOP"
                                disabled={!!initialMod}
                                style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Görünen Ad *
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Örn: Dying Is OP"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Açıklama (Opsiyonel)
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Modun kısa açıklaması..."
                            style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                GitHub Owner
                            </label>
                            <input
                                type="text"
                                value={githubOwner}
                                onChange={(e) => setGithubOwner(e.target.value)}
                                disabled={true}
                                style={{ width: '100%', padding: '10px 12px', fontSize: '13px', opacity: 0.7 }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Repository *
                            </label>
                            <input
                                type="text"
                                value={githubRepository}
                                onChange={(e) => {
                                    setIsRepoTouched(true);
                                    setGithubRepository(e.target.value);
                                }}
                                placeholder="Örn: DyingIsOP"
                                disabled={!!initialMod}
                                style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Branch
                            </label>
                            <input
                                type="text"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                placeholder="main"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Allowlist Dosyası
                            </label>
                            <input
                                type="text"
                                value={allowlistPath}
                                onChange={(e) => setAllowlistPath(e.target.value)}
                                placeholder="README.md"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                            />
                        </div>
                    </div>

                    {/* Preview URLs */}
                    {effectiveRepo && (
                        <div style={{
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '16px',
                            fontSize: '12px'
                        }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileCode size={13} /> URL Önizleme:
                            </div>
                            <a
                                href={previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent-blue)', display: 'block', marginBottom: '4px', textDecoration: 'underline', wordBreak: 'break-all' }}
                            >
                                {previewUrl} <ExternalLink size={10} style={{ display: 'inline' }} />
                            </a>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', wordBreak: 'break-all' }}>
                                Raw: {rawPreviewUrl}
                            </div>
                        </div>
                    )}

                    {/* Connection Test Result */}
                    {testResult && (
                        <div style={{
                            backgroundColor: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '16px',
                            fontSize: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: testResult.success ? '#4ade80' : 'var(--accent-red)' }}>
                                {testResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                {testResult.success ? 'GitHub Bağlantısı Doğrulandı' : 'Bağlantı Hatası'}
                            </div>

                            {testResult.success ? (
                                <div style={{ marginTop: '8px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                    <div>✓ Repository ve branch bulundu.</div>
                                    <div>✓ {allowlistPath} dosyası okundu (SHA: {testResult.fileSha?.slice(0, 7)}...).</div>
                                    <div>
                                        • Marker durumu:{' '}
                                        {testResult.hasMalformedMarkers ? (
                                            <span style={{ color: 'var(--accent-red)' }}>Bozuk Marker ({testResult.malformedReason})</span>
                                        ) : testResult.isManagedSectionPresent ? (
                                            <span style={{ color: '#4ade80' }}>BlumeCore Managed Bölüm Mevcut</span>
                                        ) : (
                                            <span>Yalnızca Legacy Bölüm (Managed bölüm ilk sync&apos;te eklenecek)</span>
                                        )}
                                    </div>
                                    <div>• Eski (unmanaged) UUID sayısı: <strong>{testResult.legacyUuidCount || 0}</strong></div>
                                    <div>• BlumeCore yönetilen UUID sayısı: <strong>{testResult.managedUuidCount || 0}</strong></div>
                                    <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                                        {testResult.writePermissionNote}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginTop: '6px', color: 'var(--accent-red)' }}>
                                    {testResult.error}
                                </div>
                            )}
                        </div>
                    )}

                    {formError && (
                        <div style={{ color: 'var(--accent-red)', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={14} /> {formError}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting || !effectiveRepo}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '10px 16px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                cursor: isTesting || !effectiveRepo ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isTesting ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                            Bağlantıyı Test Et
                        </button>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '13px'
                                }}
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="btn-primary"
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 600
                                }}
                            >
                                {isSaving ? 'Kaydediliyor...' : initialMod ? 'Değişiklikleri Kaydet' : 'Modu Kaydet'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
