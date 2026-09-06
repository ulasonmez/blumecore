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

export interface ConnectionTestResult {
    success: boolean;
    repositoryFound: boolean;
    branchFound: boolean;
    fileFound: boolean;
    fileSha?: string;
    fileContent?: string;
    writePermissionNote: string;
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

    const repoRegex = /^[a-zA-Z0-9._-]+$/;
    if (!repoRegex.test(params.githubRepository)) {
        throw new GitHubApiError(
            'GitHub repository ismi geçersiz karakterler içeriyor.',
            400,
            'INVALID_REPOSITORY'
        );
    }

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
    currentSha: string,
    retryCount = 0
): Promise<GitHubUpdateResponse> {
    validateRepositoryParams(modProject);

    const endpoint = `/repos/${encodeURIComponent(modProject.githubOwner)}/${encodeURIComponent(
        modProject.githubRepository
    )}/contents/${encodeURIComponent(modProject.allowlistPath)}`;

    const base64Content = Buffer.from(newContent, 'utf8').toString('base64');
    const commitMessage = `BlumeCore: sync Minecraft access for ${modProject.modKey}`;

    const res = await githubFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
            message: commitMessage,
            content: base64Content,
            sha: currentSha,
            branch: modProject.branch
        })
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
 */
export async function testRepositoryConnection(
    modProject: Pick<ModProject, 'githubOwner' | 'githubRepository' | 'branch' | 'allowlistPath'>
): Promise<ConnectionTestResult> {
    try {
        validateRepositoryParams(modProject);

        const file = await getRepositoryFile(modProject);
        return {
            success: true,
            repositoryFound: true,
            branchFound: true,
            fileFound: true,
            fileSha: file.sha,
            fileContent: file.content,
            writePermissionNote:
                'Dosya ve repository başarıyla okundu. GitHub REST API read-only token ile write token ayrımını GET ile doğrudan raporlamaz; yazma işlemi yalnızca ilk senkronizasyonda doğrulanır.'
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Bağlantı hatası.';
        const errorCode = err instanceof GitHubApiError ? err.errorCode : 'UNKNOWN';

        return {
            success: false,
            repositoryFound: errorCode !== 'NOT_FOUND',
            branchFound: errorCode !== 'NOT_FOUND',
            fileFound: false,
            writePermissionNote: 'Bağlantı doğrulanamadı.',
            error: errorMsg,
            errorCode
        };
    }
}
