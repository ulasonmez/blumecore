if (typeof window !== 'undefined') {
    throw new Error('This module can only be loaded on the server.');
}
import { ModProject } from '../mods/types';

export const DEFAULT_ALLOWED_OWNER = process.env.GITHUB_ALLOWED_OWNER || 'blumeplugins';
export const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || '2026-03-10';

export interface GitHubFileResponse {
    content: string; // Decoded UTF-8 text
    sha: string;
    path: string;
    size: number;
}

export interface GitHubUpdateResponse {
    commitSha: string;
    fileSha: string;
    message: string;
}

export type ConnectionResultCode =
    | 'REPOSITORY_FOUND'
    | 'REPOSITORY_NOT_FOUND'
    | 'README_NOT_FOUND'
    | 'TOKEN_PERMISSION_DENIED'
    | 'RATE_LIMITED'
    | 'GITHUB_UNAVAILABLE';

export const REQUIRED_PERMISSIONS_NOTE =
    'Gerekli GitHub token izinleri:\n- Contents: Read and write\n- Administration: Read and write';

export interface ConnectionTestResult {
    success: boolean;
    resultCode: ConnectionResultCode;
    repositoryFound: boolean;
    branchFound: boolean;
    fileFound: boolean;
    defaultBranch?: string;
    fileSha?: string;
    fileContent?: string;
    writePermissionNote: string;
    requiredPermissionsNote: string;
    error?: string;
    errorCode?: string;
}

export class GitHubApiError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly errorCode: string
    ) {
        super(message);
        this.name = 'GitHubApiError';
    }
}

export const RESERVED_REPO_NAMES = new Set([
    '.',
    '..',
    '.git',
    '.github',
    'api',
    'admin',
    'settings',
    'mod',
    'mods',
    'blumeplugins',
    'test'
]);

/**
 * Strict validator for Mod ID as a GitHub repository name.
 * Rejects path traversal, URLs, slashes, whitespace-only, leading/trailing dots, and reserved names.
 */
export function validateModRepositoryName(modId: string): void {
    if (!modId || typeof modId !== 'string') {
        throw new GitHubApiError('Mod ID alanı zorunludur.', 400, 'INVALID_REPOSITORY');
    }
    const trimmed = modId.trim();
    if (!trimmed) {
        throw new GitHubApiError('Mod ID yalnızca boşluk karakterlerinden oluşamaz.', 400, 'INVALID_REPOSITORY');
    }
    if (trimmed.length > 100) {
        throw new GitHubApiError('Mod ID en fazla 100 karakter uzunluğunda olabilir.', 400, 'INVALID_REPOSITORY');
    }
    if (trimmed.includes('://')) {
        throw new GitHubApiError('Mod ID URL biçiminde olamaz.', 400, 'INVALID_REPOSITORY');
    }
    if (RESERVED_REPO_NAMES.has(trimmed.toLowerCase())) {
        throw new GitHubApiError(`'${trimmed}' ayrılmış (reserved) bir repository adıdır.`, 400, 'INVALID_REPOSITORY');
    }
    if (trimmed.startsWith('.')) {
        throw new GitHubApiError('Mod ID nokta (.) ile başlayamaz.', 400, 'INVALID_REPOSITORY');
    }
    if (trimmed.endsWith('.')) {
        throw new GitHubApiError('Mod ID nokta (.) ile bitemez.', 400, 'INVALID_REPOSITORY');
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
        throw new GitHubApiError('Mod ID eğik çizgi (/ veya \\) içeremez.', 400, 'INVALID_REPOSITORY');
    }
    if (trimmed.includes('..')) {
        throw new GitHubApiError('Mod ID path traversal (..) içeremez.', 400, 'INVALID_REPOSITORY');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
        throw new GitHubApiError('Mod ID yalnızca harf, rakam, alt çizgi, tire ve nokta içerebilir.', 400, 'INVALID_REPOSITORY');
    }
}

/**
 * Validates owner, repo, branch, and allowlist path for security.
 */
export function validateRepositoryParams(params: {
    githubOwner: string;
    githubRepository: string;
    branch: string;
    allowlistPath: string;
}): void {
    const allowedOwner = process.env.GITHUB_ALLOWED_OWNER || DEFAULT_ALLOWED_OWNER;
    if (params.githubOwner !== allowedOwner) {
        throw new GitHubApiError(
            `GitHub organizasyonu geçersiz. Yalnızca '${allowedOwner}' kabul edilmektedir.`,
            400,
            'INVALID_OWNER'
        );
    }

    validateModRepositoryName(params.githubRepository);

    const branchRegex = /^[a-zA-Z0-9._\/-]+$/;
    if (!branchRegex.test(params.branch) || params.branch.includes('..')) {
        throw new GitHubApiError(
            'GitHub branch ismi geçersiz karakterler içeriyor.',
            400,
            'INVALID_BRANCH'
        );
    }

    if (
        !params.allowlistPath ||
        params.allowlistPath.includes('..') ||
        params.allowlistPath.includes('\0') ||
        params.allowlistPath.startsWith('/') ||
        params.allowlistPath.includes('://')
    ) {
        throw new GitHubApiError(
            'Allowlist dosya yolu geçersiz veya path traversal içeriyor.',
            400,
            'INVALID_PATH'
        );
    }
}

/**
 * Retrieves GitHub token securely without exposing it.
 */
function getGitHubToken(): string {
    const token = process.env.GITHUB_TOKEN;
    if (!token || !token.trim()) {
        throw new GitHubApiError(
            'GitHub bağlantısı yapılandırılmamış. Vercel environment variables bölümünü kontrol edin.',
            500,
            'NOT_CONFIGURED'
        );
    }
    return token.trim();
}

/**
 * Safe fetch wrapper with timeout and error classification.
 */
async function githubFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const token = getGitHubToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'BlumeCore-ModSync',
        ...(options.headers as Record<string, string> || {})
    };

    try {
        const res = await fetch(`https://api.github.com${endpoint}`, {
            ...options,
            headers,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return res;
    } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
            throw new GitHubApiError('GitHub API isteği zaman aşımına uğradı (10s).', 408, 'TIMEOUT');
        }
        throw new GitHubApiError('GitHub servisine ulaşılamadı.', 503, 'NETWORK_ERROR');
    }
}

/**
 * Fetches file contents and SHA from repository.
 */
export async function getRepositoryFile(
    modProject: Pick<ModProject, 'githubOwner' | 'githubRepository' | 'branch' | 'allowlistPath'>
): Promise<GitHubFileResponse> {
    validateRepositoryParams(modProject);

    const endpoint = `/repos/${encodeURIComponent(modProject.githubOwner)}/${encodeURIComponent(
        modProject.githubRepository
    )}/contents/${encodeURIComponent(modProject.allowlistPath)}?ref=${encodeURIComponent(modProject.branch)}`;

    const res = await githubFetch(endpoint, { method: 'GET' });

    if (res.status === 404) {
        throw new GitHubApiError(
            `Dosya veya repo bulunamadı: ${modProject.githubOwner}/${modProject.githubRepository}/${modProject.allowlistPath}`,
            404,
            'NOT_FOUND'
        );
    }
    if (res.status === 401) {
        throw new GitHubApiError('GitHub token yetkilendirmesi başarısız (401).', 401, 'UNAUTHORIZED');
    }
    if (res.status === 403) {
        throw new GitHubApiError('GitHub erişim izni reddedildi veya rate limit aşıldı (403).', 403, 'FORBIDDEN');
    }
    if (res.status === 429) {
        throw new GitHubApiError('GitHub API rate limit aşıldı (429).', 429, 'RATE_LIMITED');
    }
    if (!res.ok) {
        throw new GitHubApiError(`GitHub API hatası (status: ${res.status}).`, res.status, 'API_ERROR');
    }

    const data = await res.json();
    if (!data.content || typeof data.content !== 'string') {
        throw new GitHubApiError('GitHub dosya içeriği okunamadı.', 500, 'PARSE_ERROR');
    }

    const cleanBase64 = data.content.replace(/\s/g, '');
    const decodedText = Buffer.from(cleanBase64, 'base64').toString('utf8');

    return {
        content: decodedText,
        sha: data.sha,
        path: data.path,
        size: data.size
    };
}

/**
 * Updates a file in GitHub repository with commit message and SHA protection.
 * Automatically retries up to 2 times on 409 Conflict.
 */
export async function updateRepositoryFile(
    modProject: Pick<ModProject, 'githubOwner' | 'githubRepository' | 'branch' | 'allowlistPath' | 'modKey'>,
    newContent: string,
    currentSha?: string | null,
    retryCount = 0,
    customCommitMessage?: string
): Promise<GitHubUpdateResponse> {
    validateRepositoryParams(modProject);

    const endpoint = `/repos/${encodeURIComponent(modProject.githubOwner)}/${encodeURIComponent(
        modProject.githubRepository
    )}/contents/${encodeURIComponent(modProject.allowlistPath)}`;

    const base64Content = Buffer.from(newContent, 'utf8').toString('base64');
    const commitMessage = customCommitMessage || `BlumeCore: sync Minecraft access for ${modProject.modKey}`;

    const putBody: Record<string, unknown> = {
        message: commitMessage,
        content: base64Content,
        branch: modProject.branch
    };
    if (currentSha) {
        putBody.sha = currentSha;
    }

    const res = await githubFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(putBody)
    });

    if (res.status === 409) {
        if (retryCount < 2) {
            // Refetch file and retry
            const latest = await getRepositoryFile(modProject);
            return updateRepositoryFile(modProject, newContent, latest.sha, retryCount + 1);
        }
        throw new GitHubApiError(
            'Dosya üzerinde eşzamanlı çakışma oluştu (409 Conflict). Lütfen tekrar deneyin.',
            409,
            'CONFLICT'
        );
    }

    if (res.status === 401) {
        throw new GitHubApiError('GitHub token yetkilendirmesi başarısız (401).', 401, 'UNAUTHORIZED');
    }
    if (res.status === 403) {
        throw new GitHubApiError('GitHub yazma izni reddedildi (403). Token repository izinlerini kontrol edin.', 403, 'FORBIDDEN');
    }
    if (res.status === 422) {
        throw new GitHubApiError('GitHub dosya güncelleme doğrulaması başarısız oldu (422).', 422, 'VALIDATION_FAILED');
    }
    if (!res.ok) {
        throw new GitHubApiError(`GitHub commit işlemi başarısız (status: ${res.status}).`, res.status, 'COMMIT_FAILED');
    }

    const data = await res.json();
    return {
        commitSha: data.commit?.sha || '',
        fileSha: data.content?.sha || '',
        message: commitMessage
    };
}

/**
 * Tests connection to repository without performing write operations (read-only GET).
 * Distinguishes between:
 * - REPOSITORY_FOUND
 * - REPOSITORY_NOT_FOUND
 * - README_NOT_FOUND
 * - TOKEN_PERMISSION_DENIED
 * - RATE_LIMITED
 * - GITHUB_UNAVAILABLE
 */
export async function testRepositoryConnection(
    modProject: Pick<ModProject, 'githubOwner' | 'githubRepository' | 'branch' | 'allowlistPath'>
): Promise<ConnectionTestResult> {
    try {
        validateRepositoryParams(modProject);
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Doğrulama hatası.';
        const errorCode = err instanceof GitHubApiError ? err.errorCode : 'INVALID_PARAMS';
        return {
            success: false,
            resultCode: 'REPOSITORY_NOT_FOUND',
            repositoryFound: false,
            branchFound: false,
            fileFound: false,
            writePermissionNote: 'Parametre doğrulanamadı.',
            requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
            error: errorMsg,
            errorCode
        };
    }

    const endpoint = `/repos/${encodeURIComponent(modProject.githubOwner)}/${encodeURIComponent(
        modProject.githubRepository
    )}/contents/${encodeURIComponent(modProject.allowlistPath)}?ref=${encodeURIComponent(modProject.branch)}`;

    try {
        const res = await githubFetch(endpoint, { method: 'GET' });

        if (res.status === 200) {
            const data = await res.json();
            const cleanBase64 = (data.content || '').replace(/\s/g, '');
            const decodedText = Buffer.from(cleanBase64, 'base64').toString('utf8');

            return {
                success: true,
                resultCode: 'REPOSITORY_FOUND',
                repositoryFound: true,
                branchFound: true,
                fileFound: true,
                defaultBranch: modProject.branch,
                fileSha: data.sha,
                fileContent: decodedText,
                writePermissionNote:
                    'Dosya ve repository başarıyla okundu. GitHub REST API read-only token ile write token ayrımını GET ile doğrudan raporlamaz; yazma işlemi yalnızca ilk senkronizasyonda doğrulanır.',
                requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE
            };
        }

        if (res.status === 404) {
            // Check whether repo itself exists or only the README file is missing
            const repoEndpoint = `/repos/${encodeURIComponent(modProject.githubOwner)}/${encodeURIComponent(
                modProject.githubRepository
            )}`;
            const repoRes = await githubFetch(repoEndpoint, { method: 'GET' });

            if (repoRes.status === 404) {
                return {
                    success: false,
                    resultCode: 'REPOSITORY_NOT_FOUND',
                    repositoryFound: false,
                    branchFound: false,
                    fileFound: false,
                    writePermissionNote: 'Repository bulunamadı.',
                    requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                    error: `GitHub repository bulunamadı: ${modProject.githubOwner}/${modProject.githubRepository}`,
                    errorCode: 'REPOSITORY_NOT_FOUND'
                };
            }

            if (repoRes.status === 200) {
                const repoData = await repoRes.json();
                const actualDefaultBranch = repoData.default_branch || modProject.branch || 'main';
                return {
                    success: false,
                    resultCode: 'README_NOT_FOUND',
                    repositoryFound: true,
                    branchFound: true,
                    fileFound: false,
                    defaultBranch: actualDefaultBranch,
                    writePermissionNote: 'Repository bulundu ancak allowlist dosyası bulunamadı.',
                    requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                    error: `Repository '${modProject.githubOwner}/${modProject.githubRepository}' bulundu fakat '${modProject.allowlistPath}' dosyası bulunamadı.`,
                    errorCode: 'README_NOT_FOUND'
                };
            }

            if (repoRes.status === 401) {
                return {
                    success: false,
                    resultCode: 'TOKEN_PERMISSION_DENIED',
                    repositoryFound: false,
                    branchFound: false,
                    fileFound: false,
                    writePermissionNote: 'Yetkilendirme hatası.',
                    requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                    error: 'GitHub token yetkilendirmesi başarısız (401).',
                    errorCode: 'TOKEN_PERMISSION_DENIED'
                };
            }

            if (repoRes.status === 403) {
                const isRateLimit = repoRes.headers.get('x-ratelimit-remaining') === '0';
                return {
                    success: false,
                    resultCode: isRateLimit ? 'RATE_LIMITED' : 'TOKEN_PERMISSION_DENIED',
                    repositoryFound: false,
                    branchFound: false,
                    fileFound: false,
                    writePermissionNote: isRateLimit ? 'Rate limit aşıldı.' : 'Erişim izni reddedildi.',
                    requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                    error: isRateLimit
                        ? 'GitHub API rate limit aşıldı (403).'
                        : 'GitHub erişim izni reddedildi (403). Gerekli izinler: Contents: Read and write, Administration: Read and write.',
                    errorCode: isRateLimit ? 'RATE_LIMITED' : 'TOKEN_PERMISSION_DENIED'
                };
            }

            if (repoRes.status === 429) {
                return {
                    success: false,
                    resultCode: 'RATE_LIMITED',
                    repositoryFound: false,
                    branchFound: false,
                    fileFound: false,
                    writePermissionNote: 'Rate limit aşıldı.',
                    requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                    error: 'GitHub API rate limit aşıldı (429).',
                    errorCode: 'RATE_LIMITED'
                };
            }
        }

        if (res.status === 401) {
            return {
                success: false,
                resultCode: 'TOKEN_PERMISSION_DENIED',
                repositoryFound: false,
                branchFound: false,
                fileFound: false,
                writePermissionNote: 'Yetkilendirme hatası.',
                requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                error: 'GitHub token yetkilendirmesi başarısız (401).',
                errorCode: 'TOKEN_PERMISSION_DENIED'
            };
        }

        if (res.status === 403) {
            const isRateLimit = res.headers.get('x-ratelimit-remaining') === '0';
            return {
                success: false,
                resultCode: isRateLimit ? 'RATE_LIMITED' : 'TOKEN_PERMISSION_DENIED',
                repositoryFound: false,
                branchFound: false,
                fileFound: false,
                writePermissionNote: isRateLimit ? 'Rate limit aşıldı.' : 'Erişim izni reddedildi.',
                requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                error: isRateLimit
                    ? 'GitHub API rate limit aşıldı (403).'
                    : 'GitHub erişim izni reddedildi (403). Gerekli izinler: Contents: Read and write, Administration: Read and write.',
                errorCode: isRateLimit ? 'RATE_LIMITED' : 'TOKEN_PERMISSION_DENIED'
            };
        }

        if (res.status === 429) {
            return {
                success: false,
                resultCode: 'RATE_LIMITED',
                repositoryFound: false,
                branchFound: false,
                fileFound: false,
                writePermissionNote: 'Rate limit aşıldı.',
                requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
                error: 'GitHub API rate limit aşıldı (429).',
                errorCode: 'RATE_LIMITED'
            };
        }

        return {
            success: false,
            resultCode: 'GITHUB_UNAVAILABLE',
            repositoryFound: false,
            branchFound: false,
            fileFound: false,
            writePermissionNote: 'Bağlantı hatası.',
            requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
            error: `GitHub API hatası (status: ${res.status}).`,
            errorCode: 'API_ERROR'
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Bağlantı hatası.';
        const errorCode = err instanceof GitHubApiError ? err.errorCode : 'UNKNOWN';

        const isUnavailable = errorCode === 'TIMEOUT' || errorCode === 'NETWORK_ERROR' || errorCode === 'API_ERROR';

        return {
            success: false,
            resultCode: isUnavailable ? 'GITHUB_UNAVAILABLE' : (errorCode === 'NOT_FOUND' ? 'REPOSITORY_NOT_FOUND' : 'GITHUB_UNAVAILABLE'),
            repositoryFound: false,
            branchFound: false,
            fileFound: false,
            writePermissionNote: 'Bağlantı doğrulanamadı.',
            requiredPermissionsNote: REQUIRED_PERMISSIONS_NOTE,
            error: errorMsg,
            errorCode
        };
    }
}

export interface ProvisionResult {
    repositoryUrl: string;
    branch: string;
    readmeSha: string;
    defaultBranch: string;
    alreadyExisted: boolean;
    initialReadmeContent: string;
}

/**
 * Provisions a public GitHub repository and verifies initial README.md.
 * Strictly adheres to security rules:
 * - Only public repos
 * - Only GITHUB_ALLOWED_OWNER
 * - No private repository creation
 * - Verifies personal vs organization account
 * - Preserves auto_init README content without UUIDs
 */
export async function provisionGitHubRepository(params: {
    modId: string;
    description?: string;
}): Promise<ProvisionResult> {
    validateModRepositoryName(params.modId);

    const owner = process.env.GITHUB_ALLOWED_OWNER || DEFAULT_ALLOWED_OWNER;
    const cleanModId = params.modId.trim();

    // 1. Check if repo already exists immediately before creation
    const checkRes = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanModId)}`, {
        method: 'GET'
    });

    if (checkRes.status === 200) {
        const repoData = await checkRes.json();
        const defaultBranch = repoData.default_branch || 'main';

        const fileRes = await githubFetch(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanModId)}/contents/README.md?ref=${encodeURIComponent(
                defaultBranch
            )}`,
            { method: 'GET' }
        );

        if (fileRes.status === 200) {
            const fileData = await fileRes.json();
            const cleanBase64 = (fileData.content || '').replace(/\s/g, '');
            const decodedText = Buffer.from(cleanBase64, 'base64').toString('utf8');

            return {
                repositoryUrl: repoData.html_url || `https://github.com/${owner}/${cleanModId}`,
                branch: defaultBranch,
                readmeSha: fileData.sha,
                defaultBranch,
                alreadyExisted: true,
                initialReadmeContent: decodedText
            };
        }
    }

    // 2. Determine whether owner is a User or Organization
    let isOrg = true;
    const userRes = await githubFetch(`/users/${encodeURIComponent(owner)}`, { method: 'GET' });
    if (userRes.ok) {
        const userData = await userRes.json();
        isOrg = userData.type === 'Organization';
    }

    let createEndpoint: string;
    if (isOrg) {
        createEndpoint = `/orgs/${encodeURIComponent(owner)}/repos`;
    } else {
        // Personal account: verify token owner login matches owner
        const tokenUserRes = await githubFetch('/user', { method: 'GET' });
        if (tokenUserRes.ok) {
            const tokenUser = await tokenUserRes.json();
            if (tokenUser.login && tokenUser.login.toLowerCase() !== owner.toLowerCase()) {
                throw new GitHubApiError(
                    `Token sahibi (${tokenUser.login}) ile GITHUB_ALLOWED_OWNER (${owner}) eşleşmiyor.`,
                    403,
                    'OWNER_MISMATCH'
                );
            }
        }
        createEndpoint = '/user/repos';
    }

    const payload = {
        name: cleanModId,
        description: params.description?.trim() || `Minecraft mod access repository for ${cleanModId}`,
        private: false,
        auto_init: true,
        has_issues: false,
        has_projects: false,
        has_wiki: false
    };

    const createRes = await githubFetch(createEndpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (createRes.status === 401 || createRes.status === 403) {
        throw new GitHubApiError(
            'GitHub repository oluşturma yetkisi reddedildi (403/401). Gerekli izinler: Administration: Read and write, Contents: Read and write.',
            createRes.status,
            'TOKEN_PERMISSION_DENIED'
        );
    }

    if (createRes.status === 429) {
        throw new GitHubApiError('GitHub API rate limit aşıldı (429).', 429, 'RATE_LIMITED');
    }

    if (createRes.status === 422) {
        // Name might already exist: re-verify with GET
        const recheckRes = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanModId)}`, {
            method: 'GET'
        });
        if (recheckRes.status === 200) {
            const repoData = await recheckRes.json();
            const defaultBranch = repoData.default_branch || 'main';
            const fileRes = await githubFetch(
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanModId)}/contents/README.md?ref=${encodeURIComponent(
                    defaultBranch
                )}`,
                { method: 'GET' }
            );
            if (fileRes.status === 200) {
                const fileData = await fileRes.json();
                const cleanBase64 = (fileData.content || '').replace(/\s/g, '');
                return {
                    repositoryUrl: repoData.html_url || `https://github.com/${owner}/${cleanModId}`,
                    branch: defaultBranch,
                    readmeSha: fileData.sha,
                    defaultBranch,
                    alreadyExisted: true,
                    initialReadmeContent: Buffer.from(cleanBase64, 'base64').toString('utf8')
                };
            }
        }
        throw new GitHubApiError('GitHub repository oluşturma doğrulaması başarısız oldu (422).', 422, 'VALIDATION_FAILED');
    }

    if (!createRes.ok) {
        throw new GitHubApiError(`GitHub repository oluşturulamadı (status: ${createRes.status}).`, createRes.status, 'CREATE_FAILED');
    }

    const createdData = await createRes.json();

    // 3. Post-creation verification
    const verifyRepoRes = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanModId)}`, {
        method: 'GET'
    });
    if (!verifyRepoRes.ok) {
        throw new GitHubApiError('Oluşturulan repository doğrulanamadı.', 500, 'VERIFICATION_FAILED');
    }
    const verifiedRepoData = await verifyRepoRes.json();
    const defaultBranch = verifiedRepoData.default_branch || createdData.default_branch || 'main';

    // Verify README with contents API (retry up to 3 times for auto_init propagation)
    let fileSha = '';
    let initialReadme = '';
    for (let attempt = 0; attempt < 3; attempt++) {
        const fileRes = await githubFetch(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(cleanModId)}/contents/README.md?ref=${encodeURIComponent(
                defaultBranch
            )}`,
            { method: 'GET' }
        );
        if (fileRes.status === 200) {
            const fileData = await fileRes.json();
            fileSha = fileData.sha;
            const cleanBase64 = (fileData.content || '').replace(/\s/g, '');
            initialReadme = Buffer.from(cleanBase64, 'base64').toString('utf8');
            break;
        }
        await new Promise((r) => setTimeout(r, 400));
    }

    if (!fileSha) {
        throw new GitHubApiError('Oluşturulan repository içerisinde README.md dosyası doğrulanamadı.', 500, 'README_NOT_FOUND');
    }

    return {
        repositoryUrl: verifiedRepoData.html_url || createdData.html_url || `https://github.com/${owner}/${cleanModId}`,
        branch: defaultBranch,
        readmeSha: fileSha,
        defaultBranch,
        alreadyExisted: false,
        initialReadmeContent: initialReadme
    };
}
