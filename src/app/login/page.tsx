'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import styles from './Login.module.css';

const AUTHORIZED_OWNER_UID = 'Vkp7vtLHSuPZyXU8ohOZqvRoeE22';

export default function LoginPage() {
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();

    useEffect(() => {
        if (searchParams.get('error') === 'unauthorized') {
            setError('Bu hesaba BlumeCore için erişim izni verilmemiştir. Sadece yetkili yönetici giriş yapabilir.');
        }
    }, [searchParams]);

    useEffect(() => {
        if (user && !authLoading) {
            if (user.uid === AUTHORIZED_OWNER_UID) {
                router.push('/home');
            } else {
                signOut(auth).catch(() => {});
                setError('Bu hesaba BlumeCore için erişim izni verilmemiştir.');
            }
        }
    }, [user, authLoading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const formattedEmail = `${nickname.trim().toLowerCase()}@blumecore.app`;
            const cred = await signInWithEmailAndPassword(auth, formattedEmail, password);

            // Strict client verification
            if (cred.user.uid !== AUTHORIZED_OWNER_UID) {
                await signOut(auth);
                setError('Bu hesaba BlumeCore için erişim izni verilmemiştir.');
                setLoading(false);
                return;
            }

            // Create server session cookie
            const idToken = await cred.user.getIdToken();
            const sessionRes = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });

            if (!sessionRes.ok) {
                await signOut(auth);
                const sessionData = await sessionRes.json().catch(() => ({}));
                setError(sessionData.error || 'Oturum oluşturulamadı: Yetkisiz hesap.');
                setLoading(false);
                return;
            }

            router.push('/home');
        } catch (err: unknown) {
            console.error("Auth error:", err);
            const authError = err as { code?: string; message?: string };
            if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
                setError('Kullanıcı adı veya şifre hatalı.');
            } else if (authError.code === 'auth/too-many-requests') {
                setError('Çok fazla başarısız deneme yapıldı. Lütfen biraz sonra tekrar deneyin.');
            } else {
                setError('Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || (user && user.uid === AUTHORIZED_OWNER_UID)) {
        return null; // Prevent flicker while redirecting
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.logo}>BlumeCore</div>
                <h1 className={styles.title}>Yönetici Girişi</h1>
                <p className={styles.subtitle}>
                    BlumeCore özel yönetim paneline erişmek için oturum açın
                </p>

                {error && <div className={styles.error}>{error}</div>}

                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="nickname">Kullanıcı Adı</label>
                        <input
                            id="nickname"
                            type="text"
                            className="input"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            required
                            placeholder="Yönetici kullanıcı adı"
                            pattern="[a-zA-Z0-9]+"
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="password">Şifre</label>
                        <input
                            id="password"
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>
                    <button type="submit" className={`btn-primary ${styles.button}`} disabled={loading}>
                        {loading ? 'Doğrulanıyor...' : 'Giriş Yap'}
                    </button>
                </form>
            </div>
        </div>
    );
}
