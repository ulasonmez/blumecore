import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { ModProject } from '@/lib/mods/types';
import { validateModProjectInput } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        const snap = await adminDb
            .collection('mod_projects')
            .where('userId', '==', userId)
            .get();

        const mods: ModProject[] = [];
        snap.forEach((d) => {
            const data = d.data() as Omit<ModProject, 'id'>;
            if (!data.isArchived) {
                mods.push({ id: d.id, ...data });
            }
        });

        // Sort: active first, then newest
        mods.sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return b.createdAt - a.createdAt;
        });

        return NextResponse.json({ data: mods });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Modlar yüklenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        // Strictly use userId from authenticated session
        const userId = authUser.userId;

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

        const { modKey, description } = body || {};

        const cleanModKey = typeof modKey === 'string' ? modKey.trim() : '';
        if (!cleanModKey) {
            return NextResponse.json({ error: 'Mod ID alanı zorunludur.' }, { status: 400 });
        }

        // Server-enforced values derived directly from modKey
        const owner = process.env.GITHUB_ALLOWED_OWNER || 'blumeplugins';
        const repo = cleanModKey;
        const targetBranch = 'main';
        const targetPath = 'README.md';
        const effectiveDisplayName = (typeof body.displayName === 'string' && body.displayName.trim()) || cleanModKey;

        try {
            validateModProjectInput({
                modKey: cleanModKey,
                displayName: effectiveDisplayName,
                githubOwner: owner,
                githubRepository: repo,
                branch: targetBranch,
                allowlistPath: targetPath
            });
        } catch (valErr) {
            return NextResponse.json({ error: valErr instanceof Error ? valErr.message : 'Geçersiz mod parametreleri.' }, { status: 400 });
        }

        // Check if modKey already exists for this user
        const existingSnap = await adminDb
            .collection('mod_projects')
            .where('userId', '==', userId)
            .where('modKey', '==', cleanModKey)
            .get();

        if (!existingSnap.empty) {
            return NextResponse.json({ error: `Bu mod kimliğine (${cleanModKey}) sahip bir mod zaten mevcut.` }, { status: 409 });
        }

        const now = Date.now();
        const newMod: Omit<ModProject, 'id'> = {
            modKey: cleanModKey,
            displayName: effectiveDisplayName,
            description: typeof description === 'string' ? description.trim() : '',
            githubOwner: owner,
            githubRepository: repo,
            branch: targetBranch,
            allowlistPath: targetPath,
            syncMode: 'LEGACY_README',
            isActive: true,
            syncStatus: 'PENDING',
            lastSuccessfulSyncAt: null,
            lastSuccessfulCommitSha: null,
            userId,
            createdAt: now,
            updatedAt: now
        };

        const docRef = await adminDb.collection('mod_projects').add(newMod);

        return NextResponse.json({ data: { id: docRef.id, ...newMod } }, { status: 201 });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod kaydedilirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
