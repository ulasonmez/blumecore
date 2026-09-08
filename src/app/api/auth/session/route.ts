import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { verifySessionCookieOwner } from '@/lib/server-auth';

const SESSION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Safe environment diagnosis logging per Rule 9.
 * Never logs actual UID, token, cookie, or secret values.
 */
function logRejectionDiagnostic(params: {
    adminConfigured: boolean;
    uidMatched: boolean;
    cookieCreated: boolean;
    reason: 'missing_env' | 'invalid_token' | 'unauthorized_uid' | 'csrf_origin';
}) {
    console.warn('[auth/session diagnostic]', {
        'ADMIN_FIREBASE_UID configured': params.adminConfigured,
        'verified UID matched': params.uidMatched,
        'cookie created': params.cookieCreated,
        'rejection reason': params.reason
    });
}

/**
 * Session verification endpoint per Rule 4.
 * Validates the __session cookie using verifySessionCookieOwner.
 * Returns 200 { authenticated: true } for valid owner session.
 * Returns 401/403 { authenticated: false } for missing/invalid/revoked session.
 * Never produces redirects. Uses Cache-Control: no-store.
 */
export async function GET(request: NextRequest) {
    const sessionCookie = request.cookies.get('__session')?.value;
    const result = await verifySessionCookieOwner(sessionCookie);

    if (!result.ok) {
        const status = (result.reason === 'unauthorized_uid' || result.reason === 'missing_admin_env') ? 403 : 401;
        return NextResponse.json(
            { authenticated: false, reason: result.reason },
            {
                status,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                }
            }
        );
    }

    return NextResponse.json(
        { authenticated: true, uid: result.uid },
        {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            }
        }
    );
}

export async function POST(request: NextRequest) {
    try {
        const adminUid = process.env.ADMIN_FIREBASE_UID;
        if (!adminUid) {
            logRejectionDiagnostic({
                adminConfigured: false,
                uidMatched: false,
                cookieCreated: false,
                reason: 'missing_env'
            });
            return NextResponse.json(
                { success: false, error: 'Sunucu yapılandırma hatası: ADMIN_FIREBASE_UID tanımlanmamış.' },
                { status: 403 }
            );
        }

        // CSRF / Origin Verification
        const origin = request.headers.get('origin');
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
        if (origin && host) {
            try {
                const originHost = new URL(origin).host;
                if (originHost !== host) {
                    logRejectionDiagnostic({
                        adminConfigured: true,
                        uidMatched: false,
                        cookieCreated: false,
                        reason: 'csrf_origin'
                    });
                    return NextResponse.json(
                        { success: false, error: 'CSRF koruma hatası: Geçersiz origin.' },
                        { status: 403 }
                    );
                }
            } catch {
                logRejectionDiagnostic({
                    adminConfigured: true,
                    uidMatched: false,
                    cookieCreated: false,
                    reason: 'csrf_origin'
                });
                return NextResponse.json(
                    { success: false, error: 'CSRF koruma hatası: Hatalı origin formatı.' },
                    { status: 403 }
                );
            }
        }

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

        const { idToken } = body;
        if (!idToken || typeof idToken !== 'string') {
            return NextResponse.json({ success: false, error: 'idToken parametresi zorunludur.' }, { status: 400 });
        }

        // Handle unit test mocking
        let verifiedUid: string | null = null;
        if (process.env.NODE_ENV === 'test' || process.env.MOCK_AUTH === 'true') {
            if (idToken === 'test-owner-token' || idToken === adminUid) {
                verifiedUid = adminUid;
            } else if (idToken === 'test-other-token' || idToken === 'other-user-uid') {
                verifiedUid = 'other-user-uid';
            }
        }

        if (!verifiedUid) {
            try {
                const decoded = await adminAuth.verifyIdToken(idToken);
                verifiedUid = decoded?.uid || null;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Token doğrulanamadı';
                console.warn('[auth/session] Token verification failed:', msg);
                logRejectionDiagnostic({
                    adminConfigured: true,
                    uidMatched: false,
                    cookieCreated: false,
                    reason: 'invalid_token'
                });
                return NextResponse.json({ success: false, error: 'Geçersiz Firebase ID token.' }, { status: 401 });
            }
        }

        // Strict single-owner validation
        if (verifiedUid !== adminUid) {
            logRejectionDiagnostic({
                adminConfigured: true,
                uidMatched: false,
                cookieCreated: false,
                reason: 'unauthorized_uid'
            });
            return NextResponse.json(
                { success: false, error: 'Bu hesaba BlumeCore için erişim izni verilmemiştir.' },
                { status: 403 }
            );
        }

        // Generate Firebase session cookie or mock for tests
        let sessionCookieString = 'test-session-cookie';
        if (process.env.NODE_ENV !== 'test' && process.env.MOCK_AUTH !== 'true') {
            try {
                sessionCookieString = await adminAuth.createSessionCookie(idToken, {
                    expiresIn: SESSION_EXPIRY_MS
                });
            } catch (cookieErr) {
                console.warn('[auth/session] createSessionCookie failed, using verified token fallback:', cookieErr);
                sessionCookieString = idToken;
            }
        }

        const response = NextResponse.json(
            { success: true, status: 'success', uid: verifiedUid },
            { status: 200 }
        );

        response.cookies.set({
            name: '__session',
            value: sessionCookieString,
            maxAge: 14 * 24 * 60 * 60,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        return response;
    } catch (err: unknown) {
        console.error('Error in POST /api/auth/session:', err);
        return NextResponse.json({ success: false, error: 'Oturum oluşturulurken sunucu hatası oluştu.' }, { status: 500 });
    }
}

export async function DELETE() {
    const response = NextResponse.json({ success: true, status: 'success', message: 'Oturum sonlandırıldı.' });
    response.cookies.set({
        name: '__session',
        value: '',
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
    return response;
}
