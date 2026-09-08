import { auth } from './firebase';

/**
 * Centralized authenticated fetch helper for frontend API requests.
 * Automatically attaches the current Firebase user's ID token as `Authorization: Bearer <idToken>`.
 * Also includes `x-user-id` header as context.
 * If a 401 Unauthorized response is returned, forces a token refresh and retries once.
 * If a 403 Forbidden response is returned, detects unauthorized account and signs out.
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
            if (body?.error && (body.error.includes('Yetkisiz') || body.error.includes('yetkiniz'))) {
                await auth.signOut();
                if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                    window.location.href = '/login?error=unauthorized';
                }
            }
        } catch {
            // Ignore parse errors
        }
    }

    return response;
}
