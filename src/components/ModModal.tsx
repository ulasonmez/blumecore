'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2, ExternalLink, ShieldCheck, FolderGit2 } from 'lucide-react';
import { ModProject } from '@/lib/mods/types';
import { useAuth } from '@/lib/auth-context';
import styles from './ModModal.module.css';

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
    const [description, setDescription] = useState('');

    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResultState | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (initialMod) {
            setModKey(initialMod.modKey);
            setDescription(initialMod.description || '');
        } else {
            setModKey('');
            setDescription('');
        }
        setTestResult(null);
        setFieldError(null);
        setFormError(null);
    }, [initialMod, isOpen]);

    const handleModKeyChange = (val: string) => {
        setModKey(val);
        setTestResult(null);
        if (fieldError) setFieldError(null);
        if (formError) setFormError(null);
    };

    const trimmedModKey = modKey.trim();
    const effectiveOwner = 'blumeplugins';
    const effectiveRepo = trimmedModKey;
    const effectiveBranch = 'main';
    const effectivePath = 'README.md';

    const repoUrl = trimmedModKey ? `https://github.com/${effectiveOwner}/${effectiveRepo}` : '';
    const rawPreviewUrl = trimmedModKey
        ? `https://raw.githubusercontent.com/${effectiveOwner}/${effectiveRepo}/refs/heads/${effectiveBranch}/${effectivePath}`
        : '';

    const handleTestConnection = async () => {
        if (!trimmedModKey || !user || isTesting) return;

        // Validation for mod ID before testing
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedModKey)) {
            setFieldError('Mod ID yalnızca harf, rakam, alt çizgi ve tire içerebilir.');
            return;
        }

        setIsTesting(true);
        setTestResult(null);
        setFormError(null);
        setFieldError(null);

        try {
            const res = await fetch('/api/mods/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    modKey: trimmedModKey,
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

        if (!trimmedModKey) {
            setFieldError('Mod ID alanı zorunludur.');
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedModKey)) {
            setFieldError('Mod ID yalnızca harf, rakam, alt çizgi ve tire içerebilir.');
            return;
        }

        setIsSaving(true);
        setFormError(null);
        setFieldError(null);

        try {
            const url = initialMod ? `/api/mods/${initialMod.id}` : '/api/mods';
            const method = initialMod ? 'PATCH' : 'POST';

            const payload = initialMod
                ? {
                    description: description.trim()
                }
                : {
                    modKey: trimmedModKey,
                    displayName: trimmedModKey,
                    description: description.trim()
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
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>
                            {initialMod ? 'Mod Projesini Düzenle' : 'Yeni Mod Projesi Ekle'}
                        </h2>
                        <p className={styles.subtitle}>
                            Minecraft allowlist senkronizasyonu için mod tanımlayın
                        </p>
                    </div>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Kapat">
                        <X size={18} />
                    </button>
                </div>

                <form className={styles.form} onSubmit={handleSave}>
                    {/* Mod ID */}
                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            <span>
                                Mod ID <span className={styles.requiredStar}>*</span>
                            </span>
                        </label>
                        <input
                            type="text"
                            value={modKey}
                            onChange={(e) => handleModKeyChange(e.target.value)}
                            placeholder="Örn: DyingIsOP"
                            disabled={!!initialMod}
                            className={`${styles.input} ${fieldError ? styles.inputError : ''}`}
                            autoFocus={!initialMod}
                        />
                        {fieldError && (
                            <div className={styles.fieldError}>
                                <AlertTriangle size={13} /> {fieldError}
                            </div>
                        )}
                    </div>

                    {/* Description (Optional) */}
                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            <span>Açıklama</span>
                            <span className={styles.optionalBadge}>Opsiyonel</span>
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Modun kısa açıklaması..."
                            className={styles.input}
                        />
                    </div>

                    {/* GitHub Target Info Card */}
                    <div className={`${styles.previewCard} ${trimmedModKey ? styles.previewCardActive : ''}`}>
                        <div className={styles.previewCardHeader}>
                            <span className={styles.previewCardTitle}>
                                <FolderGit2 size={13} /> GitHub Hedefi
                            </span>
                            {trimmedModKey && (
                                <a
                                    href={repoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.repoMeta}
                                    title="GitHub deposunu aç"
                                >
                                    <span>Görüntüle</span>
                                    <ExternalLink size={11} />
                                </a>
                            )}
                        </div>

                        <div className={styles.repoBadge}>
                            {effectiveOwner}/{trimmedModKey || '...'}
                        </div>

                        <div className={styles.repoMeta}>
                            <span>{effectiveBranch}</span>
                            <span>·</span>
                            <span>{effectivePath}</span>
                        </div>

                        {trimmedModKey && (
                            <div className={styles.rawUrl} title="Hedef allowlist dosyası raw URL">
                                {rawPreviewUrl}
                            </div>
                        )}
                    </div>

                    {/* Connection Test Result */}
                    {testResult && (
                        <div className={`${styles.testResult} ${testResult.success ? styles.testSuccess : styles.testFailure}`}>
                            <div className={styles.testHeader}>
                                {testResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                <span>{testResult.success ? 'GitHub Bağlantısı Doğrulandı' : 'Bağlantı Hatası'}</span>
                            </div>

                            {testResult.success ? (
                                <div className={styles.testBody}>
                                    <div>✓ <code>{effectiveOwner}/{effectiveRepo}</code> repository ve <code>{effectiveBranch}</code> dalı bulundu.</div>
                                    <div>✓ <code>{effectivePath}</code> dosyası okundu (SHA: {testResult.fileSha?.slice(0, 7)}).</div>
                                    <div>• Eski UUID sayısı: <strong>{testResult.legacyUuidCount || 0}</strong></div>
                                    <div>• BlumeCore yönetilen UUID: <strong>{testResult.managedUuidCount || 0}</strong></div>
                                </div>
                            ) : (
                                <div className={styles.testBody}>
                                    {testResult.error}
                                </div>
                            )}
                        </div>
                    )}

                    {formError && (
                        <div className={styles.fieldError}>
                            <AlertTriangle size={14} /> {formError}
                        </div>
                    )}

                    {/* Actions */}
                    <div className={styles.actionFooter}>
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting || !trimmedModKey}
                            className={styles.btnTest}
                            title={!trimmedModKey ? 'Bağlantıyı test etmek için önce Mod ID giriniz' : 'GitHub bağlantısını ve README erişimini test et'}
                        >
                            {isTesting ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={14} />}
                            Bağlantıyı Test Et
                        </button>

                        <div className={styles.actionButtonsRight}>
                            <button
                                type="button"
                                onClick={onClose}
                                className={styles.btnCancel}
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || !trimmedModKey}
                                className={styles.btnSubmit}
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
