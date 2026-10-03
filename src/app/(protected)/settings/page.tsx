'use client';

import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '@/lib/firebase';
import { useIncomeVisibility } from '@/lib/income-visibility';
import styles from './Settings.module.css';

export default function SettingsPage() {
    const { user } = useAuth();
    const { showIncome, loading: incomeSettingLoading, error: incomeSettingError } = useIncomeVisibility();
    const [savingIncomeSetting, setSavingIncomeSetting] = useState(false);
    const [saveError, setSaveError] = useState(false);

    const handleIncomeVisibilityChange = async () => {
        if (!user || incomeSettingLoading || incomeSettingError || savingIncomeSetting) return;
        setSavingIncomeSetting(true);
        setSaveError(false);
        try {
            await setDoc(doc(db, 'user_settings', user.uid), { showIncomeTotals: !showIncome }, { merge: true });
        } catch (error) {
            console.error('Error saving income visibility:', error);
            setSaveError(true);
        } finally {
            setSavingIncomeSetting(false);
        }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/session', { method: 'DELETE' });
            await signOut(auth);
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    if (!user) {
        return (
            <div className={styles.container}>
                <h1 className="page-title">Giriş Yap</h1>
                <p className="page-subtitle">Uygulamayı kullanmak için giriş yapın.</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1 className="page-title">Ayarlar</h1>
            <p className="page-subtitle">Hesap ve uygulama ayarları</p>

            <div className="card" style={{ marginBottom: '24px' }}>
                <p className={styles.sectionTitle}>HESAP</p>

                <div className={styles.profileHeader}>
                    <div className={styles.avatar}>
                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className={styles.userInfo}>
                        <h2 className={styles.userName}>{user.displayName || 'ulas'}</h2>
                        <p className={styles.userRole}>Yönetici</p>
                    </div>
                </div>

                <button className={`btn-secondary ${styles.actionButton}`} onClick={handleLogout}>
                    <LogOut size={16} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
                    <span>Çıkış Yap</span>
                </button>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <p className={styles.sectionTitle}>GÖRÜNÜRLÜK</p>
                <label className={styles.settingRow}>
                    <span>Takvimde gelir toplamlarını göster</span>
                    <input
                        type="checkbox"
                        checked={showIncome}
                        disabled={incomeSettingLoading || incomeSettingError || savingIncomeSetting}
                        onChange={handleIncomeVisibilityChange}
                        aria-label="Takvimde gelir toplamlarını göster"
                    />
                </label>
                {(incomeSettingError || saveError) && <p role="alert" className={styles.settingError}>Gelir görünürlüğü ayarı kaydedilemedi veya yüklenemedi.</p>}
            </div>

            <div className="card">
                <p className={styles.sectionTitle}>HAKKINDA</p>

                <div className={styles.infoRow}>
                    <span>Versiyon</span>
                    <span className={styles.infoValue}>1.0.2</span>
                </div>

                <div className={styles.infoRow}>
                    <span>Geliştirici</span>
                    <span className={styles.infoValue}>Ulaş Sönmez</span>
                </div>
            </div>
        </div>
    );
}
