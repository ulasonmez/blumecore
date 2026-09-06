import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
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

        const qMods = query(collection(db, 'mod_projects'), where('userId', '==', userId));
        const snap = await getDocs(qMods);

        const mods: ModProject[] = [];
        snap.forEach((d) => {
            mods.push({ id: d.id, ...(d.data() as Omit<ModProject, 'id'>) });
        });

        // Sort: active first, then newest
        mods.sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return b.createdAt - a.createdAt;
        });

        return NextResponse.json({ data: mods });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods:', err);
        return NextResponse.json({ error: 'Modlar yüklenirken bir hata oluştu.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        const body = await request.json();
        const { modKey, displayName, description, githubOwner, githubRepository, branch, allowlistPath } = body;

        const owner = githubOwner || process.env.GITHUB_ALLOWED_OWNER || 'blumeplugins';
        const repo = githubRepository || (modKey ? modKey.trim() : '');
        const targetBranch = branch || 'main';
        const targetPath = allowlistPath || 'README.md';

        validateModProjectInput({
            modKey,
            displayName,
            githubOwner: owner,
            githubRepository: repo,
            branch: targetBranch,
            allowlistPath: targetPath
        });

        // Check if modKey already exists for this user
        const qExisting = query(
            collection(db, 'mod_projects'),
            where('userId', '==', userId),
            where('modKey', '==', modKey.trim())
        );
        const existingSnap = await getDocs(qExisting);
        if (!existingSnap.empty) {
            return NextResponse.json({ error: `Bu mod kimliğine (${modKey}) sahip bir mod zaten mevcut.` }, { status: 409 });
        }

        const now = Date.now();
        const newMod: Omit<ModProject, 'id'> = {
            modKey: modKey.trim(),
            displayName: displayName.trim(),
            description: description ? description.trim() : '',
            githubOwner: owner,
            githubRepository: repo.trim(),
            branch: targetBranch.trim(),
            allowlistPath: targetPath.trim(),
            syncMode: 'LEGACY_README',
            isActive: true,
            lastSuccessfulSyncAt: null,
            lastSuccessfulCommitSha: null,
            userId,
            createdAt: now,
            updatedAt: now
        };

        const docRef = await addDoc(collection(db, 'mod_projects'), newMod);

        return NextResponse.json({ data: { id: docRef.id, ...newMod } }, { status: 201 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Mod oluşturulurken bir hata oluştu.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
