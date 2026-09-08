import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from './firebase-admin';

export const AUTHORIZED_FIREBASE_UID = 'Vkp7vtLHSuPZyXU8ohOZqvRoeE22';

export interface AuthenticatedUser {
    userId: string;
    isSystemAdmin: boolean;
    email?: string;
}

export interface AuthenticatedOwner {
    userId: string;
    email?: string;
}

export type OwnerAuthResult =
    | { ok: true; user: AuthenticatedOwner }
    | { ok: false; response: NextResponse };

export type OwnerOrCronResult =
    | { ok: true; callerType: 'owner' | 'cron'; userId: string; email?: string }
    | { ok: false; response: NextResponse };

/**
 * Centrally validates that the incoming request originates from the single authorized BlumeCore owner.
 * 
 * Rules:
 * 1. Checks Firebase ID token (Authorization: Bearer <token>) or session cookie (__session).
 * 2. If token/cookie is invalid or missing -> 401 Unauthorized.
 * 3. Verified UID must strictly equal process.env.ADMIN_FIREBASE_UID.
 * 4. If ADMIN_FIREBASE_UID is undefined or empty, fails closed -> 403 Forbidden.
 * 5. If verified UID does not match ADMIN_FIREBASE_UID -> 403 Forbidden.
 * 6. Never trusts client-sent userId, x-user-id, or isSystemAdmin claims.
 */
export async function requireOwnerUser(request: NextRequest): Promise<OwnerAuthResult> {
    const adminUid = process.env.ADMIN_FIREBASE_UID;

    // Fail-closed rule: Reject immediately if ADMIN_FIREBASE_UID is missing
    if (!adminUid) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Sunucu güvenlik yapılandırması eksik: ADMIN_FIREBASE_UID tanımlanmamış (Fail-Closed).' },
                { status: 403 }
            )
        };
    }

    // 1. Extract Bearer token or session cookie
    let idToken: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        idToken = authHeader.substring(7).trim();
    }

    const sessionCookie = request.cookies.get('__session')?.value || null;

    if (!idToken && !sessionCookie) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Yetkilendirme hatası: Oturum açmanız veya geçerli bir token sağlamanız gerekmektedir.' },
                { status: 401 }
            )
        };
    }

    let verifiedUid: string | null = null;
    let verifiedEmail: string | undefined = undefined;

    // In unit test environment, support deterministic test tokens without network
    const isTestOrMock = process.env.NODE_ENV === 'test' || process.env.MOCK_AUTH === 'true';
    if (isTestOrMock) {
        const testToken = idToken || sessionCookie;
        if (testToken === 'test-owner-token' || testToken === adminUid) {
            verifiedUid = adminUid;
            verifiedEmail = 'admin@blumecore.app';
        } else if (testToken === 'test-other-token' || testToken === 'other-user-uid' || testToken?.startsWith('test-unauthorized')) {
            verifiedUid = 'other-user-uid';
            verifiedEmail = 'other@test.com';
        } else if (testToken === 'invalid-token') {
            return {
                ok: false,
                response: NextResponse.json(
                    { error: 'Yetkilendirme hatası: Geçersiz token.' },
                    { status: 401 }
                )
            };
        }
    }

    // Standard Firebase Admin Token & Cookie Verification
    if (!verifiedUid) {
        if (idToken) {
            try {
                const decoded = await adminAuth.verifyIdToken(idToken);
                if (decoded && decoded.uid) {
                    verifiedUid = decoded.uid;
                    verifiedEmail = decoded.email;
                }
            } catch {
                // Try session cookie if idToken rejected
            }
        }

        if (!verifiedUid && sessionCookie) {
            try {
                const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
                if (decoded && decoded.uid) {
                    verifiedUid = decoded.uid;
                    verifiedEmail = decoded.email;
                }
            } catch {
                // Session cookie also failed
            }
        }
    }

    if (!verifiedUid) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Yetkilendirme hatası: Geçersiz veya süresi dolmuş oturum.' },
                { status: 401 }
            )
        };
    }

    // Strict UID check against configured ADMIN_FIREBASE_UID
    if (verifiedUid !== adminUid) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Bu işlem için erişim yetkiniz bulunmamaktadır (Yetkisiz Firebase UID).' },
                { status: 403 }
            )
        };
    }

    return {
        ok: true,
        user: {
            userId: verifiedUid,
            email: verifiedEmail
        }
    };
}

/**
 * Validates Cron authorization header strictly matching:
 * Authorization: Bearer ${CRON_SECRET}
 */
export function requireCronSecret(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Sunucu yapılandırma hatası: CRON_SECRET tanımlanmamış.' },
                { status: 500 }
            )
        };
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Yetkilendirme başarısız (Geçersiz veya eksik CRON_SECRET).' },
                { status: 401 }
            )
        };
    }

    return { ok: true };
}

/**
 * Validates either the single BlumeCore owner OR an authorized Cron/Worker caller.
 * Used exclusively for background job execution endpoints.
 */
export async function requireOwnerOrCron(request: NextRequest): Promise<OwnerOrCronResult> {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    // 1. Cron Bearer check
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return {
            ok: true,
            callerType: 'cron',
            userId: 'cron-worker'
        };
    }

    // 2. Owner User check
    const ownerRes = await requireOwnerUser(request);
    if (!ownerRes.ok) {
        return ownerRes;
    }

    return {
        ok: true,
        callerType: 'owner',
        userId: ownerRes.user.userId,
        email: ownerRes.user.email
    };
}

/**
 * Legacy compatibility helper: validates single owner and returns user object or null.
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
    const result = await requireOwnerUser(request);
    if (!result.ok) {
        return null;
    }
    return {
        userId: result.user.userId,
        isSystemAdmin: true,
        email: result.user.email
    };
}

export type ServerSessionVerificationResult =
    | { ok: true; uid: string }
    | { ok: false; reason: 'missing' | 'revoked_or_invalid' | 'unauthorized_uid' | 'missing_admin_env' };

/**
 * Server-side session cookie verification for protected page layouts.
 * Uses Firebase Admin verifySessionCookie(cookie, true) to check revocation status.
 * Guarantees that only the configured single owner UID is permitted.
 */
export async function verifySessionCookieOwner(
    sessionCookie: string | undefined
): Promise<ServerSessionVerificationResult> {
    const adminUid = process.env.ADMIN_FIREBASE_UID;
    if (!adminUid) {
        return { ok: false, reason: 'missing_admin_env' };
    }

    if (!sessionCookie || !sessionCookie.trim()) {
        return { ok: false, reason: 'missing' };
    }

    let verifiedUid: string | null = null;

    // Unit test / deterministic mock support
    if (process.env.NODE_ENV === 'test' || process.env.MOCK_AUTH === 'true') {
        if (sessionCookie === 'test-owner-token' || sessionCookie === adminUid) {
            verifiedUid = adminUid;
        } else if (sessionCookie === 'revoked-session' || sessionCookie === 'invalid-session') {
            return { ok: false, reason: 'revoked_or_invalid' };
        } else if (sessionCookie === 'test-other-token' || sessionCookie === 'other-user-uid' || sessionCookie.startsWith('test-unauthorized')) {
            verifiedUid = 'other-user-uid';
        }
    }

    if (!verifiedUid) {
        try {
            // checkRevoked = true ensures revoked sessions are rejected
            const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
            if (decoded && decoded.uid) {
                verifiedUid = decoded.uid;
            }
        } catch {
            return { ok: false, reason: 'revoked_or_invalid' };
        }
    }

    if (!verifiedUid || verifiedUid !== adminUid) {
        return { ok: false, reason: 'unauthorized_uid' };
    }

    return { ok: true, uid: verifiedUid };
}

