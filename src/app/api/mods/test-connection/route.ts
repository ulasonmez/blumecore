import { NextRequest, NextResponse } from 'next/server';
import { testRepositoryConnection } from '@/lib/github/client';
import { parseLegacyReadme } from '@/lib/github/readme-parser';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }

        const body = await request.json();
        const { githubOwner, githubRepository, branch, allowlistPath } = body;

        const owner = githubOwner || process.env.GITHUB_ALLOWED_OWNER || 'blumeplugins';
        const repo = (githubRepository || '').trim();
        const targetBranch = (branch || 'main').trim();
        const targetPath = (allowlistPath || 'README.md').trim();

        if (!repo) {
            return NextResponse.json({ error: 'Repository ismi gereklidir.' }, { status: 400 });
        }

        const connTest = await testRepositoryConnection({
            githubOwner: owner,
            githubRepository: repo,
            branch: targetBranch,
            allowlistPath: targetPath
        });

        if (!connTest.success || !connTest.fileContent) {
            return NextResponse.json({
                data: {
                    success: false,
                    repositoryFound: connTest.repositoryFound,
                    branchFound: connTest.branchFound,
                    fileFound: false,
                    writePermissionNote: connTest.writePermissionNote,
                    error: connTest.error || 'README dosyasına ulaşılamadı.',
                    errorCode: connTest.errorCode
                }
            });
        }

        const parsed = parseLegacyReadme(connTest.fileContent);

        return NextResponse.json({
            data: {
                success: true,
                repositoryFound: true,
                branchFound: true,
                fileFound: true,
                fileSha: connTest.fileSha,
                writePermissionNote: connTest.writePermissionNote,
                isManagedSectionPresent: parsed.isManagedSectionPresent,
                hasMalformedMarkers: parsed.hasMalformedMarkers,
                malformedReason: parsed.malformedReason || null,
                legacyUuidCount: parsed.legacyUuids.length,
                managedUuidCount: parsed.allManagedUuids.length
            }
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Bağlantı testi hatası.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
