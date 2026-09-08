'use client';

import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const AUTHORIZED_OWNER_UID = 'Vkp7vtLHSuPZyXU8ohOZqvRoeE22';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [unauthorized, setUnauthorized] = useState(false);

    useEffect(() => {
        if (loading) return;

        if (!user && pathname !== '/login') {
            router.replace('/login');
            setIsCheckingSession(false);
            return;
        }

        if (user) {
            // Strict single-owner check
            if (user.uid !== AUTHORIZED_OWNER_UID) {
                console.warn('[ProtectedRoute] Unauthorized UID detected:', user.uid);
                setUnauthorized(true);
                // Immediately kick unauthorized user out of client auth & session
                (async () => {
                    try {
                        await fetch('/api/auth/session', { method: 'DELETE' });
                        await signOut(auth);
                    } catch (e) {
                        console.error('Error during unauthorized signOut:', e);
                    }
                    router.replace('/login?error=unauthorized');
                })();
                return;
            }

            setUnauthorized(false);
            setIsCheckingSession(false);
        }
    }, [user, loading, router, pathname]);

    if (loading || isCheckingSession) {
        return (
            <div style={{ display: 'flex', height: '100vh', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</div>
            </div>
        );
    }

    if (unauthorized) {
        return (
            <div style={{ display: 'flex', height: '100vh', width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 600 }}>Erişim Yetkisi Yok</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Bu hesaba BlumeCore için erişim izni verilmemiştir.</p>
            </div>
        );
    }

    if (!user || user.uid !== AUTHORIZED_OWNER_UID) {
        return null;
    }

    return <>{children}</>;
}
