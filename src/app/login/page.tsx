'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import styles from './Login.module.css';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    useEffect(() => {
        if (user && !authLoading) {
            router.push('/home');
        }
    }, [user, authLoading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Arka planda sahte bir email oluşturuyoruz
            const formattedEmail = `${nickname.trim().toLowerCase()}@blumecore.app`;

            if (isLogin) {
                await signInWithEmailAndPassword(auth, formattedEmail, password);
            } else {
                await createUserWithEmailAndPassword(auth, formattedEmail, password);
            }
            router.push('/home');
        } catch (err: any) {
            console.error("Auth error:", err);
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Kullanıcı adı veya şifre hatalı.');
            } else if (err.code === 'auth/email-already-in-use') {
                setError('Bu kullanıcı adı zaten alınmış.');
            } else if (err.code === 'auth/weak-password') {
                setError('Şifre en az 6 karakter olmalıdır.');
            } else {
                setError('Bir hata oluştu. Lütfen tekrar deneyin.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || user) return null; // Prevent flicker while redirecting

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.logo}>BlumeCore</div>
                <h1 className={styles.title}>{isLogin ? 'Hoş Geldiniz' : 'Hesap Oluştur'}</h1>
                <p className={styles.subtitle}>
                    {isLogin ? 'Hesabınıza giriş yaparak verilere erişin' : 'Yeni bir hesap oluşturarak başlayın'}
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
                            placeholder="Sadece harf ve rakam"
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
                        {loading ? 'İşleniyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
                    </button>
                </form>

                <div className={styles.toggle}>
                    {isLogin ? 'Hesabınız yok mu?' : 'Zaten bir hesabınız var mı?'}
                    <button
                        type="button"
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className={styles.toggleBtn}
                    >
                        {isLogin ? 'Kayıt Ol' : 'Giriş Yap'}
                    </button>
                </div>
            </div>
        </div>
    );
}
