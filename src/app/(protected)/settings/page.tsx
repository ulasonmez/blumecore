'use client';

import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut } from 'lucide-react';
import styles from './Settings.module.css';

export default function SettingsPage() {
    const { user } = useAuth();

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
