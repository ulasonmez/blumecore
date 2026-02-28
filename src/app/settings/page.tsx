'use client';

import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Trash2, Users } from 'lucide-react';
import styles from './Settings.module.css';

export default function SettingsPage() {
    const { user } = useAuth();

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    const handleDeleteAccount = async () => {
        // In a real app we would re-authenticate before deletion
        if (confirm('Hesabınızı silmek istediğinize emin misiniz?')) {
            try {
                await user?.delete();
            } catch (error) {
                console.error('Error deleting account:', error);
                alert('Hesap silinirken bir hata oluştu veya yeniden giriş yapmanız gerekiyor.');
            }
        }
    };

    // If user is not logged in, we show a basic placeholder or login button (to be expanded later)
    if (!user) {
        return (
            <div className={styles.container}>
                <h1 className="page-title">Giriş Yap</h1>
                <p className="page-subtitle">Uygulamayı kullanmak için giriş yapın.</p>
                <button className="btn-primary" style={{ marginTop: '20px' }}>
                    Giriş Yap Placeholder
                </button>
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
                        <p className={styles.userRole}>Kullanıcı</p>
                    </div>
                </div>


                <button className={`btn-secondary ${styles.actionButton}`} onClick={handleLogout}>
                    Çıkış Yap
                </button>

                <button className={styles.deleteButton} onClick={handleDeleteAccount}>
                    <Trash2 size={16} />
                    <span>Hesabı Sil</span>
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
