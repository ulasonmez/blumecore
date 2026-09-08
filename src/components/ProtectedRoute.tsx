'use client';

import { useAuth } from '@/lib/auth-context';

/**
 * Client-side helper guard.
 * Per Rule 1: Server-side layout is the single authority.
 * ProtectedRoute provides auxiliary loading UX and does NOT perform
 * counter-redirects between /login and /home.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { loading } = useAuth();

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</div>
            </div>
        );
    }

    return <>{children}</>;
}

