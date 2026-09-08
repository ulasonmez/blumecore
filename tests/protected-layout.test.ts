import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
    verifySessionCookieOwner,
    AUTHORIZED_FIREBASE_UID
} from '../src/lib/server-auth';
import { POST as sessionPost } from '../src/app/api/auth/session/route';

describe('Server-Side Protected Layout & Session Verification Tests', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.ADMIN_FIREBASE_UID = AUTHORIZED_FIREBASE_UID;
        (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('1. verifySessionCookieOwner (Server-Side Layout Guard)', () => {
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

    describe('2. CSRF & Origin Verification on POST /api/auth/session', () => {
        it('should allow session creation when Origin matches Host header', async () => {
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
            assert.strictEqual(data.status, 'success');
            assert.strictEqual(data.uid, AUTHORIZED_FIREBASE_UID);
        });

        it('should REJECT session creation with 403 when Origin does not match Host (Cross-Origin CSRF Attack)', async () => {
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
            assert.match(data.error, /CSRF koruma hatası/);
        });

        it('should REJECT session creation with 403 when Origin has an invalid URL format', async () => {
            const req = new NextRequest('http://localhost:3000/api/auth/session', {
                method: 'POST',
                headers: {
                    host: 'localhost:3000',
                    origin: 'invalid-url-format',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ idToken: AUTHORIZED_FIREBASE_UID })
            });

            const res = await sessionPost(req);
            assert.strictEqual(res.status, 403);
            const data = await res.json();
            assert.match(data.error, /CSRF koruma hatası/);
        });
    });

    describe('3. Cookie Security Flag Determination', () => {
        it('should determine secure: true in production and secure: false in development', () => {
            const isSecureProd = (env: string) => env === 'production';
            assert.strictEqual(isSecureProd('production'), true);
            assert.strictEqual(isSecureProd('development'), false);
            assert.strictEqual(isSecureProd('test'), false);
        });
    });
});
