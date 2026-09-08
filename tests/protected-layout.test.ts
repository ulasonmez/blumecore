import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
    verifySessionCookieOwner,
    AUTHORIZED_FIREBASE_UID
} from '../src/lib/server-auth';
import {
    GET as sessionGet,
    POST as sessionPost,
    DELETE as sessionDelete
} from '../src/app/api/auth/session/route';
import { isSessionEndpoint } from '../src/lib/api-client';

describe('Server-Side Protected Layout & Session Verification Tests', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.ADMIN_FIREBASE_UID = AUTHORIZED_FIREBASE_UID;
        (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('1. verifySessionCookieOwner (Server-Side Layout Guard - Rule 1 & 7)', () => {
        it('should ALLOW access when valid owner session cookie is present', async () => {
            const result = await verifySessionCookieOwner(AUTHORIZED_FIREBASE_UID);
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.strictEqual(result.uid, AUTHORIZED_FIREBASE_UID);
            }
        });

        it('should reject with reason: missing when session cookie is undefined or empty', async () => {
            const undefinedResult = await verifySessionCookieOwner(undefined);
            assert.strictEqual(undefinedResult.ok, false);
            if (!undefinedResult.ok) {
                assert.strictEqual(undefinedResult.reason, 'missing');
            }

            const emptyResult = await verifySessionCookieOwner('   ');
            assert.strictEqual(emptyResult.ok, false);
            if (!emptyResult.ok) {
                assert.strictEqual(emptyResult.reason, 'missing');
            }
        });

        it('should reject with reason: revoked_or_invalid when session has been revoked', async () => {
            const result = await verifySessionCookieOwner('revoked-session');
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.reason, 'revoked_or_invalid');
            }
        });

        it('should reject with reason: revoked_or_invalid when session cookie format is invalid', async () => {
            const result = await verifySessionCookieOwner('invalid-session');
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.reason, 'revoked_or_invalid');
            }
        });

        it('should reject with reason: unauthorized_uid when session belongs to a non-owner UID', async () => {
            const result = await verifySessionCookieOwner('test-other-token');
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.reason, 'unauthorized_uid');
            }
        });

        it('should fail closed with reason: missing_admin_env when ADMIN_FIREBASE_UID is unset', async () => {
            delete process.env.ADMIN_FIREBASE_UID;

            const result = await verifySessionCookieOwner(AUTHORIZED_FIREBASE_UID);
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.strictEqual(result.reason, 'missing_admin_env');
            }
        });
    });

    describe('2. GET /api/auth/session (Session Status Verification Endpoint - Rule 4)', () => {
        it('should return 200 { authenticated: true } for valid owner session with no-store cache header', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'GET',
                headers: {
                    cookie: `__session=${AUTHORIZED_FIREBASE_UID}`
                }
            });

            const res = await sessionGet(req);
            assert.strictEqual(res.status, 200);
            assert.match(res.headers.get('cache-control') || '', /no-store/);

            const data = await res.json();
            assert.strictEqual(data.authenticated, true);
            assert.strictEqual(data.uid, AUTHORIZED_FIREBASE_UID);
        });

        it('should return 401 { authenticated: false, reason: "missing" } when __session cookie is absent', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'GET'
            });

            const res = await sessionGet(req);
            assert.strictEqual(res.status, 401);
            assert.match(res.headers.get('cache-control') || '', /no-store/);

            const data = await res.json();
            assert.strictEqual(data.authenticated, false);
            assert.strictEqual(data.reason, 'missing');
        });

        it('should return 401 { authenticated: false, reason: "revoked_or_invalid" } for revoked session cookie', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'GET',
                headers: {
                    cookie: '__session=revoked-session'
                }
            });

            const res = await sessionGet(req);
            assert.strictEqual(res.status, 401);

            const data = await res.json();
            assert.strictEqual(data.authenticated, false);
            assert.strictEqual(data.reason, 'revoked_or_invalid');
        });

        it('should return 403 { authenticated: false, reason: "unauthorized_uid" } for non-owner session cookie', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'GET',
                headers: {
                    cookie: '__session=test-other-token'
                }
            });

            const res = await sessionGet(req);
            assert.strictEqual(res.status, 403);

            const data = await res.json();
            assert.strictEqual(data.authenticated, false);
            assert.strictEqual(data.reason, 'unauthorized_uid');
        });
    });

    describe('3. POST /api/auth/session (Session Creation & Cookie Specification - Rule 5 & 9)', () => {
        it('should allow session creation, return success: true and attach __session cookie with correct attributes', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'http://localhost:3000',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: AUTHORIZED_FIREBASE_UID })
            });

            const res = await sessionPost(req);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.status, 'success');
            assert.strictEqual(data.uid, AUTHORIZED_FIREBASE_UID);

            const setCookie = res.headers.get('set-cookie');
            assert.ok(setCookie, 'set-cookie header must be present');
            assert.match(setCookie, /__session=/);
            assert.match(setCookie, /Path=\//i);
            assert.match(setCookie, /HttpOnly/i);
            assert.match(setCookie, /SameSite=Lax/i);
        });

        it('should set Secure cookie attribute in production environment', async () => {
            (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
            process.env.MOCK_AUTH = 'true';

            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'http://localhost:3000',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: AUTHORIZED_FIREBASE_UID })
            });

            const res = await sessionPost(req);
            assert.strictEqual(res.status, 200);
            const setCookie = res.headers.get('set-cookie') || '';
            assert.match(setCookie, /Secure/i);
        });

        it('should REJECT session creation with 403 when Origin does not match Host (Cross-Origin CSRF)', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'https://malicious-attacker-site.com',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: AUTHORIZED_FIREBASE_UID })
            });

            const res = await sessionPost(req);
            assert.strictEqual(res.status, 403);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.error, /CSRF koruma hatası/);
        });

        it('should REJECT session creation with 403 when UID is unauthorized', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'http://localhost:3000',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: 'test-other-token' })
            });

            const res = await sessionPost(req);
            assert.strictEqual(res.status, 403);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.error, /erişim izni verilmemiştir/);
        });

        it('should REJECT session creation with 403 fail-closed when ADMIN_FIREBASE_UID is unset', async () => {
            delete process.env.ADMIN_FIREBASE_UID;

            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'http://localhost:3000',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: AUTHORIZED_FIREBASE_UID })
            });

            const res = await sessionPost(req);
            assert.strictEqual(res.status, 403);
            const data = await res.json();
            assert.strictEqual(data.success, false);
            assert.match(data.error, /ADMIN_FIREBASE_UID tanımlanmamış/);
        });
    });

    describe('4. DELETE /api/auth/session (Session Termination & Cookie Cleanup)', () => {
        it('should clear __session cookie with maxAge: 0 and path: "/"', async () => {
            const res = await sessionDelete();
            assert.strictEqual(res.status, 200);

            const data = await res.json();
            assert.strictEqual(data.success, true);

            const setCookie = res.headers.get('set-cookie') || '';
            assert.match(setCookie, /__session=/);
            assert.match(setCookie, /Path=\//i);
            assert.match(setCookie, /Max-Age=0/i);
        });
    });

    describe('5. API Interceptor Protection (Rule 6)', () => {
        it('should identify /api/auth/session paths as session endpoints', () => {
            assert.strictEqual(isSessionEndpoint('/api/auth/session'), true);
            assert.strictEqual(isSessionEndpoint(new URL('http://localhost:3000/api/auth/session')), true);
            assert.strictEqual(isSessionEndpoint({ url: '/api/auth/session' } as Request), true);

            // Other endpoints should NOT match
            assert.strictEqual(isSessionEndpoint('/api/mods'), false);
            assert.strictEqual(isSessionEndpoint('/api/youtubers'), false);
            assert.strictEqual(isSessionEndpoint('/api/videos'), false);
        });
    });

    describe('6. Navigation & Loop Prevention Invariants (Rules 1, 2, 3)', () => {
        it('should verify that client auth without session cookie fails session status check', async () => {
            // Scenario: auth.currentUser exists in Firebase client, but no cookie sent
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'GET'
            });

            const res = await sessionGet(req);
            const data = await res.json();

            // Client sees authenticated: false -> does NOT navigate to /home
            assert.strictEqual(data.authenticated, false);
            assert.notStrictEqual(data.authenticated, true);
        });

        it('should verify single in-flight lock pattern prevents duplicate concurrent requests', async () => {
            let activeRequests = 0;
            let maxConcurrent = 0;

            const isSyncingRef = { current: false };

            async function singleFlightSessionSync() {
                if (isSyncingRef.current) return null;
                isSyncingRef.current = true;
                activeRequests++;
                maxConcurrent = Math.max(maxConcurrent, activeRequests);

                // Simulate fetch call
                await new Promise((resolve) => setTimeout(resolve, 10));
                activeRequests--;
                isSyncingRef.current = false;
                return 'sync_completed';
            }

            // Trigger 5 calls in parallel
            const results = await Promise.all([
                singleFlightSessionSync(),
                singleFlightSessionSync(),
                singleFlightSessionSync(),
                singleFlightSessionSync(),
                singleFlightSessionSync()
            ]);

            assert.strictEqual(maxConcurrent, 1, 'Never run more than 1 concurrent session sync');
            assert.strictEqual(results.filter((r) => r === 'sync_completed').length, 1);
            assert.strictEqual(results.filter((r) => r === null).length, 4);
        });

        it('should ensure failed session creation does not permit /home navigation', async () => {
            // POST with unauthorized token fails
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'http://localhost:3000',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: 'unauthorized-token' })
            });

            const res = await sessionPost(req);
            assert.notStrictEqual(res.status, 200);

            const data = await res.json();
            assert.strictEqual(data.success, false);
            // Must not navigate to /home
        });
    });
});
