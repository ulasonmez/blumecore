import { NextRequest } from 'next/server';

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
 * 2. Bearer <firebaseIdToken> verified via Firebase Auth / Google Identity Toolkit API
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

    // 3. Verify Firebase ID Token via Google Identity Toolkit API if token is present
    if (token) {
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
                }
            } catch (err) {
                console.error('[server-auth] Token verification request failed:', err);
            }
        } else {
            // Development fallback when mock-api-key is configured
            const devUserId = request.headers.get('x-user-id');
            if (devUserId) {
                return {
                    userId: devUserId,
                    isSystemAdmin: false
                };
            }
        }
    }

    // 4. In development without token but with x-user-id, allow if in development
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
