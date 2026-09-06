import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateRepositoryParams,
    getRepositoryFile,
    updateRepositoryFile,
    testRepositoryConnection,
    GitHubApiError
} from '../src/lib/github/client';

describe('GitHub REST Contents API Client Tests', () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.GITHUB_TOKEN = 'secret-test-token-12345';
        process.env.GITHUB_ALLOWED_OWNER = 'blumeplugins';
    });

    afterEach(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    describe('Input & Security Validations', () => {
        it('should throw when owner does not match GITHUB_ALLOWED_OWNER', () => {
            assert.throws(() => {
                validateRepositoryParams({
                    githubOwner: 'malicious-org',
                    githubRepository: 'Repo',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
            }, /GitHub organizasyonu geçersiz/);
        });

        it('should throw when allowlistPath contains path traversal (..)', () => {
            assert.throws(() => {
                validateRepositoryParams({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'Repo',
                    branch: 'main',
                    allowlistPath: '../secret/passwords.txt'
                });
            }, /path traversal/);
        });

        it('should throw when allowlistPath starts with a slash or contains URL protocol', () => {
            assert.throws(() => {
                validateRepositoryParams({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'Repo',
                    branch: 'main',
                    allowlistPath: '/README.md'
                });
            }, /path traversal/);

            assert.throws(() => {
                validateRepositoryParams({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'Repo',
                    branch: 'main',
                    allowlistPath: 'https://evil.com/README.md'
                });
            }, /path traversal/);
        });

        it('should throw when GITHUB_TOKEN is not configured', async () => {
            delete process.env.GITHUB_TOKEN;
            await assert.rejects(async () => {
                await getRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
            }, (err: any) => {
                assert.equal(err.errorCode, 'NOT_CONFIGURED');
                return true;
            });
        });

        it('should NEVER leak the GITHUB_TOKEN in error messages', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
            };

            try {
                await getRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
                assert.fail('Should have thrown');
            } catch (err: any) {
                assert.ok(!err.message.includes('secret-test-token-12345'));
                assert.equal(err.statusCode, 401);
                assert.equal(err.errorCode, 'UNAUTHORIZED');
            }
        });
    });

    describe('Mocked GitHub REST API Operations', () => {
        it('should successfully GET and decode base64 file content', async () => {
            const fileContent = '# OpenAnyBlock\n058aa284-c0cf-4826-beae-9df1cb411623\n';
            const base64 = Buffer.from(fileContent).toString('base64');

            global.fetch = async (url: any, init: any) => {
                assert.ok(String(url).includes('/repos/blumeplugins/DyingIsOP/contents/README.md'));
                assert.equal(init?.headers?.['Authorization'], 'Bearer secret-test-token-12345');
                return new Response(JSON.stringify({
                    content: base64,
                    sha: 'sha-test-123',
                    path: 'README.md',
                    size: fileContent.length
                }), { status: 200 });
            };

            const res = await getRepositoryFile({
                githubOwner: 'blumeplugins',
                githubRepository: 'DyingIsOP',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.content, fileContent);
            assert.equal(res.sha, 'sha-test-123');
            assert.equal(res.path, 'README.md');
        });

        it('should successfully PUT updated file with commit message and SHA', async () => {
            const newContent = '# Updated\n';
            let receivedBody: any = null;

            global.fetch = async (url: any, init: any) => {
                assert.equal(init?.method, 'PUT');
                receivedBody = JSON.parse(init?.body);
                return new Response(JSON.stringify({
                    commit: { sha: 'commit-sha-789' },
                    content: { sha: 'new-file-sha-456' }
                }), { status: 200 });
            };

            const res = await updateRepositoryFile({
                githubOwner: 'blumeplugins',
                githubRepository: 'DyingIsOP',
                branch: 'main',
                allowlistPath: 'README.md',
                modKey: 'DyingIsOP'
            }, newContent, 'old-file-sha-123');

            assert.equal(res.commitSha, 'commit-sha-789');
            assert.equal(res.fileSha, 'new-file-sha-456');
            assert.equal(receivedBody.sha, 'old-file-sha-123');
            assert.equal(receivedBody.branch, 'main');
            assert.equal(Buffer.from(receivedBody.content, 'base64').toString('utf8'), newContent);
        });

        it('should handle 409 Conflict with automatic re-fetch and successful retry', async () => {
            let attempt = 0;
            const fileContent = '# Existing file\n';
            const base64 = Buffer.from(fileContent).toString('base64');

            global.fetch = async (url: any, init: any) => {
                if (init?.method === 'GET') {
                    return new Response(JSON.stringify({
                        content: base64,
                        sha: 'refetched-sha-999',
                        path: 'README.md',
                        size: fileContent.length
                    }), { status: 200 });
                }

                attempt++;
                if (attempt === 1) {
                    // First PUT yields 409 Conflict
                    return new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 });
                }
                // Second PUT succeeds with new refetched SHA
                assert.equal(JSON.parse(init?.body).sha, 'refetched-sha-999');
                return new Response(JSON.stringify({
                    commit: { sha: 'recovered-commit-sha' },
                    content: { sha: 'recovered-file-sha' }
                }), { status: 200 });
            };

            const res = await updateRepositoryFile({
                githubOwner: 'blumeplugins',
                githubRepository: 'DyingIsOP',
                branch: 'main',
                allowlistPath: 'README.md',
                modKey: 'DyingIsOP'
            }, '# Updated\n', 'initial-stale-sha');

            assert.equal(attempt, 2);
            assert.equal(res.commitSha, 'recovered-commit-sha');
        });

        it('should fail with controlled error when 409 Conflict persists after 2 retries', async () => {
            const fileContent = '# Existing file\n';
            const base64 = Buffer.from(fileContent).toString('base64');

            global.fetch = async (url: any, init: any) => {
                if (init?.method === 'GET') {
                    return new Response(JSON.stringify({
                        content: base64,
                        sha: 'new-sha',
                        path: 'README.md',
                        size: fileContent.length
                    }), { status: 200 });
                }
                return new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 });
            };

            await assert.rejects(async () => {
                await updateRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md',
                    modKey: 'DyingIsOP'
                }, '# Content\n', 'initial-sha');
            }, (err: any) => {
                assert.equal(err.errorCode, 'CONFLICT');
                assert.equal(err.statusCode, 409);
                return true;
            });
        });

        it('should handle 404 Not Found error properly', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            await assert.rejects(async () => {
                await getRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
            }, (err: any) => {
                assert.equal(err.statusCode, 404);
                assert.equal(err.errorCode, 'NOT_FOUND');
                return true;
            });
        });

        it('should handle 403 Forbidden / Rate Limit error properly', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
            };

            await assert.rejects(async () => {
                await getRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
            }, (err: any) => {
                assert.equal(err.statusCode, 403);
                assert.equal(err.errorCode, 'FORBIDDEN');
                return true;
            });
        });

        it('should handle 429 Rate Limit error properly', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 });
            };

            await assert.rejects(async () => {
                await getRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
            }, (err: any) => {
                assert.equal(err.statusCode, 429);
                assert.equal(err.errorCode, 'RATE_LIMITED');
                return true;
            });
        });

        it('should handle 500 Server Error from GitHub properly', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Internal Error' }), { status: 500 });
            };

            await assert.rejects(async () => {
                await getRepositoryFile({
                    githubOwner: 'blumeplugins',
                    githubRepository: 'DyingIsOP',
                    branch: 'main',
                    allowlistPath: 'README.md'
                });
            }, (err: any) => {
                assert.equal(err.statusCode, 500);
                assert.equal(err.errorCode, 'API_ERROR');
                return true;
            });
        });

        it('should perform read-only testRepositoryConnection without issuing PUT requests', async () => {
            let methodsUsed: string[] = [];
            const fileContent = '# README\n';
            const base64 = Buffer.from(fileContent).toString('base64');

            global.fetch = async (url: any, init: any) => {
                methodsUsed.push(init?.method || 'GET');
                return new Response(JSON.stringify({
                    content: base64,
                    sha: 'test-sha-123',
                    path: 'README.md',
                    size: fileContent.length
                }), { status: 200 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'DyingIsOP',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, true);
            assert.equal(res.repositoryFound, true);
            assert.equal(res.branchFound, true);
            assert.equal(res.fileFound, true);
            assert.deepEqual(methodsUsed, ['GET']); // Absolutely no PUT was called
        });
    });
});
