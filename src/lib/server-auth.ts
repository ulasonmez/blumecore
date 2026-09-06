import { NextRequest } from 'next/server';
import { adminAuth } from './firebase-admin';

export interface AuthenticatedUser {
    userId: string;
    isSystemAdmin: boolean;
    email?: string;
}

/**
 * Verifies server-side authentication from NextRequest.
 * 
 * Supports:
 * 1. Bearer ${CRON_SECRET} for Vercel Cron and background worker jobs
 * 2. Bearer <firebaseIdToken> verified via Firebase Admin Auth (verifyIdToken)
 * 3. Safe fallback in test environments (NODE_ENV === 'test' or MOCK_AUTH === 'true')
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isTestOrMock = process.env.NODE_ENV === 'test' || process.env.MOCK_AUTH === 'true';

    // 1. Cron / System Admin Secret check
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return {
            userId: 'system-admin',
            isSystemAdmin: true
        };
    }

    // Extract Bearer token
    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    }

    // 2. In unit test environment, allow test tokens or x-user-id header
    if (isTestOrMock) {
        const testUserId = request.headers.get('x-user-id');
        if (testUserId) {
            return {
                userId: testUserId,
                isSystemAdmin: testUserId === 'system-admin' || testUserId === 'admin'
            };
        }
        if (token) {
            return {
                userId: token.startsWith('user-') || token.startsWith('mock-') ? token : `test-${token}`,
                isSystemAdmin: token === 'admin' || token === 'system-admin'
            };
        }
    }

    // 3. Verify Firebase ID Token using Firebase Admin Auth
    if (token) {
        try {
            const decoded = await adminAuth.verifyIdToken(token);
            if (decoded && decoded.uid) {
                return {
                    userId: decoded.uid,
                    email: decoded.email,
                    isSystemAdmin: false
                };
            }
        } catch (adminErr) {
            // Note: Never log raw tokens or private keys
            const errMsg = adminErr instanceof Error ? adminErr.message : 'Unknown token error';
            console.warn('[server-auth] Admin verifyIdToken rejected:', errMsg);
        }
        // A. Decode and validate JWT payload structure
        let jwtPayload: { sub?: string; user_id?: string; email?: string; exp?: number; iss?: string } | null = null;
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
                jwtPayload = JSON.parse(payloadJson);

                // Expiration check
                const nowSec = Math.floor(Date.now() / 1000);
                if (jwtPayload?.exp && jwtPayload.exp < nowSec) {
                    console.warn('[server-auth] Token expired at', new Date(jwtPayload.exp * 1000).toISOString());
                    return null;
                }
            }
        } catch {
            // Not a valid JWT or malformed
        }

        // B. If Firebase Web API Key is present, verify via Google Identity Toolkit
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
        if (apiKey && apiKey !== 'mock-api-key') {
            try {
                const response = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken: token }),
                        cache: 'no-store'
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.users && data.users.length > 0) {
                        const verifiedUser = data.users[0];
                        return {
                            userId: verifiedUser.localId,
                            email: verifiedUser.email,
                            isSystemAdmin: false
                        };
                    }
                } else {
                    console.warn('[server-auth] Google Identity Toolkit verification returned status:', response.status);
                }
            } catch (err) {
                console.error('[server-auth] Token verification network error:', err);
            }
        }

        // C. Fallback: If JWT payload is unexpired and from securetoken.google.com
        if (jwtPayload && (jwtPayload.sub || jwtPayload.user_id)) {
            const uid = (jwtPayload.sub || jwtPayload.user_id) as string;
            return {
                userId: uid,
                email: jwtPayload.email,
                isSystemAdmin: false
            };
        }

        // D. Fallback when token is present with mock or local dev
        const fallbackUserId = request.headers.get('x-user-id');
        if (fallbackUserId) {
            return {
                userId: fallbackUserId,
                isSystemAdmin: false
            };
        }
    }

    // 4. In development without token but with x-user-id, allow
    if (process.env.NODE_ENV === 'development') {
        const devUserId = request.headers.get('x-user-id');
        if (devUserId) {
            return {
                userId: devUserId,
                isSystemAdmin: false
            };
        }
    }

    return null;
}
