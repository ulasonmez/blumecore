import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    testRepositoryConnection,
    provisionGitHubRepository,
    validateModRepositoryName,
    GitHubApiError
} from '../src/lib/github/client';

describe('GitHub Repository Provisioning & Connection Tests', () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.GITHUB_TOKEN = 'mock-github-token';
        process.env.GITHUB_ALLOWED_OWNER = 'blumeplugins';
    });

    afterEach(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    describe('Mod ID & Repository Name Validation', () => {
        it('should accept valid mod IDs with alphanumeric, hyphen, underscore, and internal dot', () => {
            assert.doesNotThrow(() => validateModRepositoryName('MilkAnyMob'));
            assert.doesNotThrow(() => validateModRepositoryName('DyingIsOP'));
            assert.doesNotThrow(() => validateModRepositoryName('custom-mod_1'));
            assert.doesNotThrow(() => validateModRepositoryName('mod.v2'));
        });

        it('should reject empty or whitespace-only Mod ID', () => {
            assert.throws(() => validateModRepositoryName(''), /Mod ID alanı zorunludur/);
            assert.throws(() => validateModRepositoryName('   '), /yalnızca boşluk/);
        });

        it('should reject names exceeding 100 characters', () => {
            const longName = 'a'.repeat(101);
            assert.throws(() => validateModRepositoryName(longName), /en fazla 100 karakter/);
        });

        it('should reject names starting or ending with a dot', () => {
            assert.throws(() => validateModRepositoryName('.hidden'), /nokta \(.\) ile başlayamaz/);
            assert.throws(() => validateModRepositoryName('hidden.'), /nokta \(.\) ile bitemez/);
        });

        it('should reject slashes and backslashes', () => {
            assert.throws(() => validateModRepositoryName('owner/repo'), /eğik çizgi/);
            assert.throws(() => validateModRepositoryName('owner\\repo'), /eğik çizgi/);
        });

        it('should reject path traversal (..)', () => {
            assert.throws(() => validateModRepositoryName('mod..name'), /path traversal/);
        });

        it('should reject URLs', () => {
            assert.throws(() => validateModRepositoryName('https://github.com/repo'), /URL biçiminde olamaz/);
        });

        it('should reject reserved repository names', () => {
            assert.throws(() => validateModRepositoryName('.git'), /ayrılmış/);
            assert.throws(() => validateModRepositoryName('api'), /ayrılmış/);
            assert.throws(() => validateModRepositoryName('admin'), /ayrılmış/);
            assert.throws(() => validateModRepositoryName('blumeplugins'), /ayrılmış/);
        });
    });

    describe('Connection Test Taxonomy', () => {
        it('should return REPOSITORY_FOUND when repo and README exist', async () => {
            const readmeContent = '# MilkAnyMob\nInitial content';
            global.fetch = async (url: any) => {
                const urlStr = String(url);
                if (urlStr.includes('/contents/README.md')) {
                    return new Response(
                        JSON.stringify({
                            content: Buffer.from(readmeContent).toString('base64'),
                            sha: 'sha-readme-123',
                            path: 'README.md',
                            size: readmeContent.length
                        }),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'MilkAnyMob',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, true);
            assert.equal(res.resultCode, 'REPOSITORY_FOUND');
            assert.equal(res.repositoryFound, true);
            assert.equal(res.branchFound, true);
            assert.equal(res.fileFound, true);
            assert.equal(res.fileSha, 'sha-readme-123');
            assert.equal(res.fileContent, readmeContent);
        });

        it('should return REPOSITORY_NOT_FOUND when repository does not exist on GitHub', async () => {
            global.fetch = async (url: any) => {
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'NonExistentMod',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'REPOSITORY_NOT_FOUND');
            assert.equal(res.repositoryFound, false);
            assert.equal(res.fileFound, false);
        });

        it('should return README_NOT_FOUND when repository exists but README.md is missing', async () => {
            global.fetch = async (url: any) => {
                const urlStr = String(url);
                if (urlStr.includes('/contents/README.md')) {
                    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
                }
                if (urlStr.endsWith('/repos/blumeplugins/ExistingModNoReadme')) {
                    return new Response(
                        JSON.stringify({
                            name: 'ExistingModNoReadme',
                            default_branch: 'main'
                        }),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'ExistingModNoReadme',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'README_NOT_FOUND');
            assert.equal(res.repositoryFound, true);
            assert.equal(res.fileFound, false);
        });

        it('should return TOKEN_PERMISSION_DENIED on 401 Unauthorized', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'ProtectedMod',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'TOKEN_PERMISSION_DENIED');
            assert.ok(res.requiredPermissionsNote.includes('Contents: Read and write'));
            assert.ok(res.requiredPermissionsNote.includes('Administration: Read and write'));
        });

        it('should return TOKEN_PERMISSION_DENIED on 403 Forbidden without rate limit', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
                    status: 403,
                    headers: { 'x-ratelimit-remaining': '500' }
                });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'ProtectedMod',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'TOKEN_PERMISSION_DENIED');
        });

        it('should return RATE_LIMITED on 403 with x-ratelimit-remaining: 0', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
                    status: 403,
                    headers: { 'x-ratelimit-remaining': '0' }
                });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'SomeMod',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'RATE_LIMITED');
        });

        it('should return RATE_LIMITED on 429 Too Many Requests', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'SomeMod',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'RATE_LIMITED');
        });

        it('should return GITHUB_UNAVAILABLE on 500 Server Error or timeout', async () => {
            global.fetch = async () => {
                return new Response(JSON.stringify({ message: 'Server Error' }), { status: 503 });
            };

            const res = await testRepositoryConnection({
                githubOwner: 'blumeplugins',
                githubRepository: 'SomeMod',
                branch: 'main',
                allowlistPath: 'README.md'
            });

            assert.equal(res.success, false);
            assert.equal(res.resultCode, 'GITHUB_UNAVAILABLE');
        });
    });

    describe('Repository Provisioning Engine', () => {
        it('should provision an organization repository using POST /orgs/{owner}/repos', async () => {
            let createdPayload: any = null;
            let postEndpoint = '';

            global.fetch = async (url: any, options: any) => {
                const urlStr = String(url);
                const method = options?.method || 'GET';

                // Initial existence check
                if (urlStr.endsWith('/repos/blumeplugins/NewOrgMod') && method === 'GET') {
                    // First check returns 404, post-creation check returns 200
                    if (postEndpoint) {
                        return new Response(
                            JSON.stringify({
                                html_url: 'https://github.com/blumeplugins/NewOrgMod',
                                default_branch: 'main'
                            }),
                            { status: 200 }
                        );
                    }
                    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
                }

                // Check owner type
                if (urlStr.endsWith('/users/blumeplugins') && method === 'GET') {
                    return new Response(JSON.stringify({ type: 'Organization' }), { status: 200 });
                }

                // Create repo in organization
                if (urlStr.endsWith('/orgs/blumeplugins/repos') && method === 'POST') {
                    postEndpoint = urlStr;
                    createdPayload = JSON.parse(options.body);
                    return new Response(
                        JSON.stringify({
                            name: 'NewOrgMod',
                            html_url: 'https://github.com/blumeplugins/NewOrgMod',
                            default_branch: 'main'
                        }),
                        { status: 201 }
                    );
                }

                // Read README after creation
                if (urlStr.includes('/contents/README.md') && method === 'GET') {
                    return new Response(
                        JSON.stringify({
                            content: Buffer.from('# NewOrgMod\n').toString('base64'),
                            sha: 'sha-initial-readme'
                        }),
                        { status: 200 }
                    );
                }

                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const result = await provisionGitHubRepository({
                modId: 'NewOrgMod',
                description: 'Custom description'
            });

            assert.equal(result.branch, 'main');
            assert.equal(result.readmeSha, 'sha-initial-readme');
            assert.equal(result.alreadyExisted, false);
            assert.equal(result.initialReadmeContent, '# NewOrgMod\n');

            // Verify payload constraints
            assert.ok(postEndpoint.includes('/orgs/blumeplugins/repos'));
            assert.equal(createdPayload.private, false); // ONLY public
            assert.equal(createdPayload.auto_init, true);
            assert.equal(createdPayload.has_issues, false);
            assert.equal(createdPayload.has_projects, false);
            assert.equal(createdPayload.has_wiki, false);
        });

        it('should provision a personal repository using POST /user/repos when owner is User and login matches', async () => {
            process.env.GITHUB_ALLOWED_OWNER = 'personalowner';
            let postEndpoint = '';

            global.fetch = async (url: any, options: any) => {
                const urlStr = String(url);
                const method = options?.method || 'GET';

                if (urlStr.endsWith('/repos/personalowner/PersonalMod') && method === 'GET') {
                    if (postEndpoint) {
                        return new Response(
                            JSON.stringify({
                                html_url: 'https://github.com/personalowner/PersonalMod',
                                default_branch: 'main'
                            }),
                            { status: 200 }
                        );
                    }
                    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
                }

                // Check owner type
                if (urlStr.endsWith('/users/personalowner') && method === 'GET') {
                    return new Response(JSON.stringify({ type: 'User' }), { status: 200 });
                }

                // Verify token owner login
                if (urlStr.endsWith('/user') && method === 'GET') {
                    return new Response(JSON.stringify({ login: 'personalowner' }), { status: 200 });
                }

                // Create personal repo
                if (urlStr.endsWith('/user/repos') && method === 'POST') {
                    postEndpoint = urlStr;
                    return new Response(
                        JSON.stringify({
                            name: 'PersonalMod',
                            html_url: 'https://github.com/personalowner/PersonalMod',
                            default_branch: 'main'
                        }),
                        { status: 201 }
                    );
                }

                if (urlStr.includes('/contents/README.md') && method === 'GET') {
                    return new Response(
                        JSON.stringify({
                            content: Buffer.from('# PersonalMod\n').toString('base64'),
                            sha: 'sha-personal-readme'
                        }),
                        { status: 200 }
                    );
                }

                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const result = await provisionGitHubRepository({ modId: 'PersonalMod' });
            assert.equal(result.branch, 'main');
            assert.ok(postEndpoint.endsWith('/user/repos'));
        });

        it('should reject personal repository creation when token owner does not match GITHUB_ALLOWED_OWNER', async () => {
            process.env.GITHUB_ALLOWED_OWNER = 'alloweduser';

            global.fetch = async (url: any) => {
                const urlStr = String(url);
                if (urlStr.endsWith('/repos/alloweduser/MismatchMod')) {
                    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
                }
                if (urlStr.endsWith('/users/alloweduser')) {
                    return new Response(JSON.stringify({ type: 'User' }), { status: 200 });
                }
                if (urlStr.endsWith('/user')) {
                    return new Response(JSON.stringify({ login: 'differentuser' }), { status: 200 });
                }
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            await assert.rejects(async () => {
                await provisionGitHubRepository({ modId: 'MismatchMod' });
            }, (err: any) => {
                assert.equal(err.errorCode, 'OWNER_MISMATCH');
                assert.equal(err.statusCode, 403);
                return true;
            });
        });

        it('should switch to link existing repository when repo already exists prior to creation', async () => {
            global.fetch = async (url: any) => {
                const urlStr = String(url);
                if (urlStr.endsWith('/repos/blumeplugins/AlreadyExistingMod')) {
                    return new Response(
                        JSON.stringify({
                            html_url: 'https://github.com/blumeplugins/AlreadyExistingMod',
                            default_branch: 'main'
                        }),
                        { status: 200 }
                    );
                }
                if (urlStr.includes('/contents/README.md')) {
                    return new Response(
                        JSON.stringify({
                            content: Buffer.from('# Existing README\n').toString('base64'),
                            sha: 'sha-existing-readme'
                        }),
                        { status: 200 }
                    );
                }
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const res = await provisionGitHubRepository({ modId: 'AlreadyExistingMod' });
            assert.equal(res.alreadyExisted, true);
            assert.equal(res.readmeSha, 'sha-existing-readme');
            assert.equal(res.initialReadmeContent, '# Existing README\n');
        });

        it('should handle GitHub 422 by re-checking and linking if created concurrently', async () => {
            let attempt = 0;
            global.fetch = async (url: any, options: any) => {
                const urlStr = String(url);
                const method = options?.method || 'GET';

                if (urlStr.endsWith('/repos/blumeplugins/ConcurrentMod') && method === 'GET') {
                    attempt++;
                    if (attempt === 1) {
                        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
                    }
                    // Created in background between calls!
                    return new Response(
                        JSON.stringify({
                            html_url: 'https://github.com/blumeplugins/ConcurrentMod',
                            default_branch: 'main'
                        }),
                        { status: 200 }
                    );
                }

                if (urlStr.endsWith('/users/blumeplugins')) {
                    return new Response(JSON.stringify({ type: 'Organization' }), { status: 200 });
                }

                if (urlStr.endsWith('/orgs/blumeplugins/repos') && method === 'POST') {
                    // GitHub returns 422 because repo was created concurrently
                    return new Response(
                        JSON.stringify({
                            message: 'Repository creation failed.',
                            errors: [{ resource: 'Repository', code: 'custom', message: 'name already exists' }]
                        }),
                        { status: 422 }
                    );
                }

                if (urlStr.includes('/contents/README.md')) {
                    return new Response(
                        JSON.stringify({
                            content: Buffer.from('# Concurrent README\n').toString('base64'),
                            sha: 'sha-concurrent-readme'
                        }),
                        { status: 200 }
                    );
                }

                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const res = await provisionGitHubRepository({ modId: 'ConcurrentMod' });
            assert.equal(res.alreadyExisted, true);
            assert.equal(res.readmeSha, 'sha-concurrent-readme');
        });

        it('should accurately detect and record non-main default branch (e.g. master or trunk)', async () => {
            let postDone = false;
            global.fetch = async (url: any, options: any) => {
                const urlStr = String(url);
                const method = options?.method || 'GET';

                if (urlStr.endsWith('/repos/blumeplugins/CustomBranchMod') && method === 'GET') {
                    if (postDone) {
                        return new Response(
                            JSON.stringify({
                                html_url: 'https://github.com/blumeplugins/CustomBranchMod',
                                default_branch: 'trunk' // Non-main default branch
                            }),
                            { status: 200 }
                        );
                    }
                    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
                }

                if (urlStr.endsWith('/users/blumeplugins')) {
                    return new Response(JSON.stringify({ type: 'Organization' }), { status: 200 });
                }

                if (urlStr.endsWith('/orgs/blumeplugins/repos') && method === 'POST') {
                    postDone = true;
                    return new Response(
                        JSON.stringify({
                            default_branch: 'trunk',
                            html_url: 'https://github.com/blumeplugins/CustomBranchMod'
                        }),
                        { status: 201 }
                    );
                }

                if (urlStr.includes('/contents/README.md?ref=trunk')) {
                    return new Response(
                        JSON.stringify({
                            content: Buffer.from('# Custom Branch\n').toString('base64'),
                            sha: 'sha-trunk'
                        }),
                        { status: 200 }
                    );
                }

                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            };

            const res = await provisionGitHubRepository({ modId: 'CustomBranchMod' });
            assert.equal(res.branch, 'trunk');
            assert.equal(res.defaultBranch, 'trunk');
            assert.equal(res.readmeSha, 'sha-trunk');
        });
    });
});
