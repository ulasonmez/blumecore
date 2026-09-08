import { NextRequest, NextResponse } from 'next/server';
import { testRepositoryConnection } from '@/lib/github/client';
import { parseLegacyReadme } from '@/lib/github/readme-parser';
import { requireOwnerUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }

        const body = await request.json();
        const rawKey = body.modKey || body.githubRepository || '';
        const repo = rawKey.trim();

        const owner = process.env.GITHUB_ALLOWED_OWNER || 'blumeplugins';
        const targetBranch = 'main';
        const targetPath = 'README.md';

        if (!repo) {
            return NextResponse.json({ error: 'Mod ID veya Repository ismi gereklidir.' }, { status: 400 });
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
                    resultCode: connTest.resultCode,
                    repositoryFound: connTest.repositoryFound,
                    branchFound: connTest.branchFound,
                    fileFound: false,
                    defaultBranch: connTest.defaultBranch || targetBranch,
                    writePermissionNote: connTest.writePermissionNote,
                    requiredPermissionsNote: connTest.requiredPermissionsNote,
                    error: connTest.error || 'README dosyasına ulaşılamadı.',
                    errorCode: connTest.errorCode
                }
            });
        }

        const parsed = parseLegacyReadme(connTest.fileContent);

        return NextResponse.json({
            data: {
                success: true,
                resultCode: connTest.resultCode,
                repositoryFound: true,
                branchFound: true,
                fileFound: true,
                defaultBranch: connTest.defaultBranch || targetBranch,
                fileSha: connTest.fileSha,
                writePermissionNote: connTest.writePermissionNote,
                requiredPermissionsNote: connTest.requiredPermissionsNote,
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
