import { auth } from './firebase';

let isHandlingUnauthorized = false;

/**
 * Checks if the request target is the auth session endpoint (/api/auth/session).
 * Session requests are excluded from interceptor auto-signout / auto-redirect chains (Rule 6).
 */
export function isSessionEndpoint(input: RequestInfo | URL): boolean {
    if (typeof input === 'string') {
        return input.includes('/api/auth/session');
    }
    if (input instanceof URL) {
        return input.pathname.includes('/api/auth/session');
    }
    if (typeof input === 'object' && 'url' in input && typeof input.url === 'string') {
        return input.url.includes('/api/auth/session');
    }
    return false;
}

/**
 * Centrally handles unauthorized session termination.
 * Guaranteed to execute once, avoids redundant redirect if already on /login,
 * and prevents concurrent navigation calls.
 */
export async function handleUnauthorizedLogout() {
    if (isHandlingUnauthorized) return;
    isHandlingUnauthorized = true;

    try {
        await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
        await auth.signOut().catch(() => {});
    } catch {
        // Ignore logout errors
    } finally {
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.replace('/login?error=unauthorized');
        }
    }
}

/**
 * Centralized authenticated fetch helper for frontend API requests.
 * Automatically attaches the current Firebase user's ID token as `Authorization: Bearer <idToken>`.
 * Also includes `x-user-id` header as context.
 * If a 401 Unauthorized response is returned on normal endpoints, forces a token refresh and retries once.
 * If a 403 Forbidden response is returned with an unauthorized account error, safely kicks to login.
 * Bypasses all redirect/signOut chains for /api/auth/session calls (Rule 6).
 */
export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
): Promise<Response> {
    const user = auth.currentUser;

    if (!user) {
        throw new Error('Oturum açmanız gerekmektedir.');
    }

    let token: string;
    try {
        token = await user.getIdToken();
    } catch {
        token = await user.getIdToken(true);
    }

    const headers = new Headers(init.headers || {});
    if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('x-user-id')) {
        headers.set('x-user-id', user.uid);
    }

    let response = await fetch(input, {
        ...init,
        headers
    });

    // Rule 6: Skip interceptor retry/redirect for /api/auth/session
    if (isSessionEndpoint(input)) {
        return response;
    }

    // If 401 Unauthorized, force refresh token and retry once
    if (response.status === 401) {
        try {
            const freshToken = await user.getIdToken(true);
            const retryHeaders = new Headers(init.headers || {});
            retryHeaders.set('Authorization', `Bearer ${freshToken}`);
            retryHeaders.set('x-user-id', user.uid);
            response = await fetch(input, {
                ...init,
                headers: retryHeaders
            });
        } catch {
            // Keep initial response if refresh fails
        }
    }

    // If 403 Forbidden with unauthorized message, kick out to login
    if (response.status === 403) {
        try {
            const clone = response.clone();
            const body = await clone.json();
            if (body?.error && (body.error.includes('Yetkisiz') || body.error.includes('yetkiniz') || body.error.includes('izin verilmemiştir'))) {
                await handleUnauthorizedLogout();
            }
        } catch {
            // Ignore parse errors
        }
    }

    return response;
}
