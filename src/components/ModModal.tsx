'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2, ExternalLink, ShieldCheck, FolderGit2, Plus, Trash2 } from 'lucide-react';
import { ModProject } from '@/lib/mods/types';
import { useAuth } from '@/lib/auth-context';
import { authenticatedFetch } from '@/lib/api-client';
import styles from './ModModal.module.css';

interface ModModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (mod: ModProject) => void;
    initialMod?: ModProject | null;
}

interface TestResultState {
    success: boolean;
    resultCode?: 'REPOSITORY_FOUND' | 'REPOSITORY_NOT_FOUND' | 'README_NOT_FOUND' | 'TOKEN_PERMISSION_DENIED' | 'RATE_LIMITED' | 'GITHUB_UNAVAILABLE';
    repositoryFound: boolean;
    branchFound: boolean;
    fileFound: boolean;
    defaultBranch?: string;
    fileSha?: string;
    writePermissionNote: string;
    requiredPermissionsNote?: string;
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
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [showProvisionModal, setShowProvisionModal] = useState(false);
    const [provisionSuccessInfo, setProvisionSuccessInfo] = useState<{
        repositoryUrl: string;
        branch: string;
        readmeSha: string;
    } | null>(null);

    const [fieldError, setFieldError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [staleArchivedModId, setStaleArchivedModId] = useState<string | null>(null);
    const [isCleaningStale, setIsCleaningStale] = useState(false);

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
        setStaleArchivedModId(null);
        setShowProvisionModal(false);
        setProvisionSuccessInfo(null);
    }, [initialMod, isOpen]);

    const handleModKeyChange = (val: string) => {
        setModKey(val);
        setTestResult(null);
        setShowProvisionModal(false);
        setProvisionSuccessInfo(null);
        setStaleArchivedModId(null);
        if (fieldError) setFieldError(null);
        if (formError) setFormError(null);
    };

    const trimmedModKey = modKey.trim();
    const effectiveOwner = 'blumeplugins';
    const effectiveRepo = trimmedModKey;
    const effectiveBranch = testResult?.defaultBranch || 'main';
    const effectivePath = 'README.md';

    const repoUrl = trimmedModKey ? `https://github.com/${effectiveOwner}/${effectiveRepo}` : '';
    const rawPreviewUrl = trimmedModKey
        ? `https://raw.githubusercontent.com/${effectiveOwner}/${effectiveRepo}/refs/heads/${effectiveBranch}/${effectivePath}`
        : '';

    const handleTestConnection = async () => {
        if (!trimmedModKey || !user || isTesting || isProvisioning) return;

        // Validation for mod ID before testing
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedModKey)) {
            setFieldError('Mod ID yalnızca harf, rakam, alt çizgi ve tire içerebilir.');
            return;
        }

        setIsTesting(true);
        setTestResult(null);
        setFormError(null);
        setFieldError(null);
        setShowProvisionModal(false);

        try {
            const res = await authenticatedFetch('/api/mods/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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
                if (json.data.resultCode === 'REPOSITORY_NOT_FOUND') {
                    setShowProvisionModal(true);
                }
            } else {
                setTestResult({
                    success: false,
                    resultCode: 'GITHUB_UNAVAILABLE',
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
                resultCode: 'GITHUB_UNAVAILABLE',
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

    const handleProvisionRepository = async () => {
        if (!trimmedModKey || !user || isProvisioning) return;

        setIsProvisioning(true);
        setFormError(null);
        setFieldError(null);
        setStaleArchivedModId(null);

        try {
            const res = await authenticatedFetch('/api/mods/provision-repository', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    modId: trimmedModKey,
                    description: description.trim()
                })
            });

            const json = await res.json();

            if (res.status === 409 && json.code === 'STALE_ARCHIVED_RECORD') {
                setStaleArchivedModId(json.modId || null);
                setFormError(json.error || 'Bu Mod ID için eski bir arşiv kaydı mevcut.');
                setShowProvisionModal(false);
                return;
            }

            if (!res.ok) {
                if (json.partialFailure) {
                    setFormError('Repository oluşturuldu ancak BlumeCore kaydı tamamlanamadı. Yeniden içe aktarabilirsiniz.');
                } else {
                    setFormError(json.error || 'Repository oluşturulamadı.');
                }
                setShowProvisionModal(false);
                return;
            }

            const provisionData = json.data;
            setShowProvisionModal(false);
            setProvisionSuccessInfo({
                repositoryUrl: provisionData.repositoryUrl,
                branch: provisionData.branch,
                readmeSha: provisionData.readmeSha
            });

            setTestResult({
                success: true,
                resultCode: 'REPOSITORY_FOUND',
                repositoryFound: true,
                branchFound: true,
                fileFound: true,
                defaultBranch: provisionData.branch,
                fileSha: provisionData.readmeSha,
                writePermissionNote: 'Repository başarıyla oluşturuldu ve doğrulandı.',
                legacyUuidCount: 0,
                managedUuidCount: 0
            });

            if (provisionData.mod) {
                onSuccess(provisionData.mod);
                onClose();
            }
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : 'Repository oluşturulurken bir hata oluştu.');
            setShowProvisionModal(false);
        } finally {
            setIsProvisioning(false);
        }
    };

    const handleCleanStaleArchived = async () => {
        if (!staleArchivedModId || !user || isCleaningStale) return;
        setIsCleaningStale(true);
        try {
            const delRes = await authenticatedFetch(`/api/mods/${staleArchivedModId}`, {
                method: 'DELETE'
            });
            const delJson = await delRes.json();
            if (delRes.ok) {
                setStaleArchivedModId(null);
                setFormError(null);
                // After clearing stale record, continue saving
                await performSave();
            } else {
                setFormError(`Eski kayıt temizlenemedi: ${delJson.error || 'Bilinmeyen hata'}`);
            }
        } catch {
            setFormError('Eski kayıt temizlenirken ağ hatası oluştu.');
        } finally {
            setIsCleaningStale(false);
        }
    };

    const performSave = async () => {
        setIsSaving(true);
        setFormError(null);
        setFieldError(null);
        setStaleArchivedModId(null);

        try {
            if (initialMod) {
                const res = await authenticatedFetch(`/api/mods/${initialMod.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: description.trim() })
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Mod güncellenemedi.');
                onSuccess(json.data);
                onClose();
                return;
            }

            // Step 1: Check if GitHub repository exists
            const testRes = await authenticatedFetch('/api/mods/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modKey: trimmedModKey,
                    githubOwner: effectiveOwner,
                    githubRepository: effectiveRepo,
                    branch: effectiveBranch,
                    allowlistPath: effectivePath
                })
            });

            const testJson = await testRes.json();
            const connData = testJson.data;
            if (connData) {
                setTestResult(connData);
            }

            if (!connData || !connData.repositoryFound) {
                // Repository does not exist on GitHub! Show provision confirmation modal
                setShowProvisionModal(true);
                return;
            }

            // Step 2: Repository exists on GitHub! Import it
            const res = await authenticatedFetch('/api/mods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modKey: trimmedModKey,
                    displayName: trimmedModKey,
                    description: description.trim()
                })
            });

            const json = await res.json();
            if (res.status === 409 && json.code === 'STALE_ARCHIVED_RECORD') {
                setStaleArchivedModId(json.modId || null);
                setFormError(json.error || 'Bu Mod ID için eski bir arşiv kaydı mevcut.');
                return;
            }

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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isSaving || isProvisioning) return;

        if (!trimmedModKey) {
            setFieldError('Mod ID alanı zorunludur.');
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedModKey)) {
            setFieldError('Mod ID yalnızca harf, rakam, alt çizgi ve tire içerebilir.');
            return;
        }

        await performSave();
    };

    if (!isOpen) return null;

    const isNotFound = testResult?.resultCode === 'REPOSITORY_NOT_FOUND';
    const isPermissionDenied = testResult?.resultCode === 'TOKEN_PERMISSION_DENIED';
    const isRateLimited = testResult?.resultCode === 'RATE_LIMITED';
    const isReadmeNotFound = testResult?.resultCode === 'README_NOT_FOUND';
    const isSuccess = testResult?.resultCode === 'REPOSITORY_FOUND' && testResult.success;

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
                    <button
                        className={styles.closeButton}
                        onClick={onClose}
                        disabled={isProvisioning || isSaving}
                        aria-label="Kapat"
                    >
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
                            placeholder="Örn: MilkAnyMob"
                            disabled={!!initialMod || isProvisioning || isSaving}
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
                            disabled={isProvisioning || isSaving}
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

                    {/* Connection Test Result / Warnings */}
                    {testResult && (
                        <div
                            className={`${styles.testResult} ${
                                isSuccess
                                    ? styles.testSuccess
                                    : isNotFound || isReadmeNotFound
                                    ? styles.testWarning
                                    : styles.testFailure
                            }`}
                        >
                            <div className={styles.testHeader}>
                                {isSuccess ? (
                                    <CheckCircle2 size={16} />
                                ) : (
                                    <AlertTriangle size={16} />
                                )}
                                <span>
                                    {isSuccess
                                        ? 'GitHub Bağlantısı Doğrulandı'
                                        : isNotFound
                                        ? 'Repository Bulunamadı'
                                        : isReadmeNotFound
                                        ? 'README Dosyası Bulunamadı'
                                        : isPermissionDenied
                                        ? 'GitHub Yetki Hatası (403/401)'
                                        : isRateLimited
                                        ? 'GitHub Rate Limit Aşıldı'
                                        : 'Bağlantı Hatası'}
                                </span>
                            </div>

                            {isSuccess ? (
                                <div className={styles.testBody}>
                                    <div>✓ <code>{effectiveOwner}/{effectiveRepo}</code> repository ve <code>{effectiveBranch}</code> dalı bulundu.</div>
                                    <div>✓ <code>{effectivePath}</code> dosyası okundu (SHA: {testResult.fileSha?.slice(0, 7)}).</div>
                                    <div>• Eski UUID sayısı: <strong>{testResult.legacyUuidCount || 0}</strong></div>
                                    <div>• BlumeCore yönetilen UUID: <strong>{testResult.managedUuidCount || 0}</strong></div>
                                </div>
                            ) : isNotFound ? (
                                <div className={styles.testBody}>
                                    <div><code>{effectiveOwner}/{effectiveRepo}</code> repository&apos;si GitHub üzerinde bulunamadı.</div>
                                    <div style={{ marginTop: '8px' }}>
                                        <button
                                            type="button"
                                            className={styles.btnProvision}
                                            onClick={() => setShowProvisionModal(true)}
                                            disabled={isProvisioning}
                                        >
                                            {isProvisioning ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                                            Public Repo ve README Oluştur
                                        </button>
                                    </div>
                                </div>
                            ) : isPermissionDenied ? (
                                <div className={styles.testBody}>
                                    <div>{testResult.error}</div>
                                    <div style={{ marginTop: '6px', fontWeight: 500 }}>
                                        Gerekli GitHub token izinleri:
                                    </div>
                                    <div>• Contents: Read and write</div>
                                    <div>• Administration: Read and write</div>
                                </div>
                            ) : (
                                <div className={styles.testBody}>
                                    {testResult.error}
                                </div>
                            )}
                        </div>
                    )}

                    {provisionSuccessInfo && (
                        <div className={`${styles.testResult} ${styles.testSuccess}`}>
                            <div className={styles.testHeader}>
                                <CheckCircle2 size={16} />
                                <span>Repository Başarıyla Oluşturuldu</span>
                            </div>
                            <div className={styles.testBody}>
                                <div>✓ <code>{provisionSuccessInfo.repositoryUrl}</code></div>
                                <div>✓ Branch: <code>{provisionSuccessInfo.branch}</code></div>
                                <div>✓ README SHA: <code>{provisionSuccessInfo.readmeSha.slice(0, 7)}</code></div>
                            </div>
                        </div>
                    )}

                    {formError && !fieldError && (
                        <div className={styles.fieldError} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={14} /> {formError}
                            </div>
                            {staleArchivedModId && (
                                <button
                                    type="button"
                                    onClick={handleCleanStaleArchived}
                                    disabled={isCleaningStale}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid var(--accent-red)',
                                        color: 'var(--accent-red)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        alignSelf: 'flex-start'
                                    }}
                                >
                                    {isCleaningStale ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                                    {isCleaningStale ? 'Eski Kayıt Temizleniyor...' : 'Eski Kaydı Kalıcı Olarak Temizle ve Devam Et'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className={styles.actionFooter}>
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting || isProvisioning || !trimmedModKey}
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
                                disabled={isProvisioning || isSaving}
                                className={styles.btnCancel}
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || isProvisioning || !trimmedModKey}
                                className={styles.btnSubmit}
                            >
                                {isProvisioning ? (
                                    <>
                                        <Loader2 size={13} className="spin" />
                                        Repository Oluşturuluyor...
                                    </>
                                ) : isSaving ? (
                                    <>
                                        <Loader2 size={13} className="spin" />
                                        Kaydediliyor...
                                    </>
                                ) : initialMod ? (
                                    'Değişiklikleri Kaydet'
                                ) : (
                                    'Modu Kaydet'
                                )}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Confirm Provision Modal */}
                {showProvisionModal && (
                    <div
                        className={styles.confirmOverlay}
                        onClick={() => !isProvisioning && setShowProvisionModal(false)}
                    >
                        <div
                            className={styles.confirmBox}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h4 className={styles.confirmTitle}>GitHub Repository Oluştur</h4>
                            <p className={styles.confirmMessage}>
                                <code>{effectiveOwner}/{trimmedModKey}</code> repository&apos;si bulunamadı.
                                <br /><br />
                                Bu adla <strong>public</strong> bir GitHub repository ve <strong>README.md</strong> oluşturulsun mu?
                            </p>
                            <div className={styles.confirmActions}>
                                <button
                                    type="button"
                                    className={styles.btnConfirmCancel}
                                    onClick={() => setShowProvisionModal(false)}
                                    disabled={isProvisioning}
                                >
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    className={styles.btnProvision}
                                    onClick={handleProvisionRepository}
                                    disabled={isProvisioning}
                                >
                                    {isProvisioning ? (
                                        <>
                                            <Loader2 size={13} className="spin" />
                                            Oluşturuluyor...
                                        </>
                                    ) : (
                                        'Public Repo ve README Oluştur'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
