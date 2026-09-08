'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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

    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();

    const sessionCheckInitiatedRef = useRef(false);
    const isNavigatingRef = useRef(false);

    useEffect(() => {
        if (searchParams.get('error') === 'unauthorized') {
            setError('Bu hesaba BlumeCore için erişim izni verilmemiştir. Sadece yetkili yönetici giriş yapabilir.');
        }
    }, [searchParams]);

    // Handle existing client Firebase session (Rule 3 & 4)
    useEffect(() => {
        if (authLoading) return;

        // If URL explicitly flags unauthorized, cleanly reset without auto-login loop
        if (searchParams.get('error') === 'unauthorized') {
            if (user) {
                signOut(auth).catch(() => {});
                fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
            }
            return;
        }

        if (!user) return;

        // Reject non-owner client session immediately
        if (user.uid !== AUTHORIZED_OWNER_UID) {
            signOut(auth).catch(() => {});
            fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
            setError('Bu hesaba BlumeCore için erişim izni verilmemiştir.');
            return;
        }

        // Single-flight in-flight guard (Rule 3)
        if (sessionCheckInitiatedRef.current) return;
        sessionCheckInitiatedRef.current = true;

        (async () => {
            try {
                // Rule 4: Verify existing server session status via GET /api/auth/session
                const checkRes = await fetch('/api/auth/session', {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' }
                });

                if (checkRes.ok) {
                    const checkData = await checkRes.json().catch(() => ({}));
                    if (checkData.authenticated === true) {
                        if (!isNavigatingRef.current) {
                            isNavigatingRef.current = true;
                            window.location.replace('/home');
                        }
                        return;
                    }
                }

                // If no valid session cookie exists, attempt one-time session creation with fresh ID token
                const idToken = await user.getIdToken();
                const sessionRes = await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken })
                });

                if (sessionRes.ok) {
                    const sessionData = await sessionRes.json().catch(() => ({}));
                    if (sessionData.success || sessionData.status === 'success') {
                        if (!isNavigatingRef.current) {
                            isNavigatingRef.current = true;
                            window.location.replace('/home');
                        }
                        return;
                    }
                }

                // Failed session creation: clean up and remain on login screen (Rule 2 & 3)
                await signOut(auth);
                await fetch('/api/auth/session', { method: 'DELETE' });
                const errorData = await sessionRes.json().catch(() => ({}));
                setError(errorData.error || 'Oturum süresi dolmuş veya geçersiz. Lütfen tekrar giriş yapın.');
            } catch (e) {
                console.error('[LoginPage] Existing session verification error:', e);
                await signOut(auth).catch(() => {});
                await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
                setError('Oturum kontrol edilirken bir hata oluştu. Lütfen tekrar giriş yapın.');
            }
        })();
    }, [user, authLoading, searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading || isNavigatingRef.current) return;
        setError('');
        setLoading(true);

        try {
            const formattedEmail = `${nickname.trim().toLowerCase()}@blumecore.app`;
            const cred = await signInWithEmailAndPassword(auth, formattedEmail, password);

            // Strict client verification
            if (cred.user.uid !== AUTHORIZED_OWNER_UID) {
                await signOut(auth);
                await fetch('/api/auth/session', { method: 'DELETE' });
                setError('Bu hesaba BlumeCore için erişim izni verilmemiştir.');
                setLoading(false);
                return;
            }

            // Retrieve current ID token
            const idToken = await cred.user.getIdToken();

            // Create server session cookie via relative URL (Rule 5)
            const sessionRes = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });

            if (!sessionRes.ok) {
                await signOut(auth);
                await fetch('/api/auth/session', { method: 'DELETE' });
                const sessionData = await sessionRes.json().catch(() => ({}));
                setError(sessionData.error || 'Oturum oluşturulamadı: Yetkisiz hesap.');
                setLoading(false);
                return;
            }

            const sessionData = await sessionRes.json().catch(() => ({}));
            if (!sessionData.success && sessionData.status !== 'success') {
                await signOut(auth);
                await fetch('/api/auth/session', { method: 'DELETE' });
                setError(sessionData.error || 'Oturum doğrulanamadı.');
                setLoading(false);
                return;
            }

            // Full page navigation ensures __session cookie is attached to /home request (Rule 2)
            isNavigatingRef.current = true;
            window.location.replace('/home');
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
            setLoading(false);
        }
    };

    if (isNavigatingRef.current) {
        return (
            <div className={styles.container}>
                <div className={styles.card} style={{ textAlign: 'center' }}>
                    <div className={styles.logo}>BlumeCore</div>
                    <p className={styles.subtitle}>Yönlendiriliyor...</p>
                </div>
            </div>
        );
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
