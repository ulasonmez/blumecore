import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { ModProject, resolveModLifecycleStatus } from '@/lib/mods/types';
import { validateModProjectInput } from '@/lib/mods/mod-service';
import { requireOwnerUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const snap = await adminDb
            .collection('mod_projects')
            .where('userId', '==', userId)
            .get();

        const mods: ModProject[] = [];
        snap.forEach((d) => {
            const data = d.data() as Omit<ModProject, 'id'>;
            const status = resolveModLifecycleStatus(data);
            const isArchived = data.isArchived === true || data.lifecycleStatus === 'ARCHIVED' || data.isActive === false || status === 'ARCHIVED';
            if (!isArchived) {
                mods.push({ id: d.id, ...data, lifecycleStatus: 'ACTIVE', isActive: true, isArchived: false });
            }
        });

        // Sort: newest first
        mods.sort((a, b) => b.createdAt - a.createdAt);

        return NextResponse.json({ data: mods });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Modlar yüklenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

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

        const canonicalModKey = cleanModKey.toLowerCase();

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

        // Case-insensitive idempotency check: do NOT silently overwrite configuration!
        const existingSnap = await adminDb
            .collection('mod_projects')
            .where('userId', '==', userId)
            .get();

        const matchedDoc = existingSnap.docs.find((d) => {
            const data = d.data();
            return data.canonicalModKey === canonicalModKey || (data.modKey && data.modKey.toLowerCase() === canonicalModKey);
        });

        if (matchedDoc) {
            const mData = matchedDoc.data();
            const isArchived = mData.isArchived === true || mData.lifecycleStatus === 'ARCHIVED' || mData.isActive === false;

            if (isArchived) {
                // Bug fix: Return 409 STALE_ARCHIVED_RECORD so UI can offer permanent cleanup
                return NextResponse.json(
                    {
                        error: 'Bu Mod ID için eski bir arşiv kaydı mevcut. Yeni mod eklemeden önce eski kaydı kalıcı olarak temizleyin.',
                        code: 'STALE_ARCHIVED_RECORD',
                        modId: matchedDoc.id,
                        modKey: mData.modKey
                    },
                    { status: 409 }
                );
            }

            return NextResponse.json(
                {
                    data: {
                        id: matchedDoc.id,
                        ...mData
                    },
                    alreadyExisted: true,
                    message: 'Bu Mod ID zaten mevcut. Mevcut kayıt korundu.'
                },
                { status: 200 }
            );
        }

        // Verify GitHub repository actually exists before saving to Firestore and queuing sync
        const { testRepositoryConnection } = await import('@/lib/github/client');
        const conn = await testRepositoryConnection({
            githubOwner: owner,
            githubRepository: repo,
            branch: targetBranch,
            allowlistPath: targetPath
        });

        if (!conn.repositoryFound) {
            return NextResponse.json(
                {
                    error: `GitHub üzerinde '${owner}/${repo}' repository'si bulunamadı. Önce repository oluşturulmalıdır.`,
                    code: 'REPOSITORY_NOT_FOUND',
                    repositoryFound: false
                },
                { status: 404 }
            );
        }

        const effectiveBranch = conn.defaultBranch || targetBranch;
        const now = Date.now();
        const newMod: Omit<ModProject, 'id'> = {
            modKey: cleanModKey,
            canonicalModKey,
            displayName: effectiveDisplayName,
            description: typeof description === 'string' ? description.trim() : '',
            githubOwner: owner,
            githubRepository: repo,
            branch: effectiveBranch,
            allowlistPath: targetPath,
            syncMode: 'LEGACY_README',
            lifecycleStatus: 'ACTIVE',
            isActive: true,
            isArchived: false,
            archiveStatus: 'ACTIVE',
            syncStatus: 'PENDING',
            lastSuccessfulSyncAt: null,
            lastSuccessfulCommitSha: null,
            userId,
            createdAt: now,
            updatedAt: now
        };

        const { prepareSyncJobInTx, applySyncJobInTx, processSyncJob } = await import('@/lib/mods/mod-service');

        // Create mod record and INITIAL_SYNC job in the same Firestore transaction,
        // strictly executing ALL reads before ANY writes (Firestore transaction invariant).
        let transactionResult: {
            docId: string;
            job: import('@/lib/mods/types').GitHubSyncJob;
            conflictCode?: 'STALE_ARCHIVED_RECORD' | 'ALREADY_EXISTS';
            conflictDoc?: import('@/lib/mods/types').ModProject;
        };

        try {
            transactionResult = await adminDb.runTransaction(async (tx) => {
                // 1. READ: Case-insensitive check on mod_projects for this user
                const modQuery = adminDb
                    .collection('mod_projects')
                    .where('userId', '==', userId);
                const userModsSnap = await tx.get(modQuery);

                const existingInTx = userModsSnap.docs.find((d) => {
                    const data = d.data();
                    return data.canonicalModKey === canonicalModKey || (data.modKey && data.modKey.toLowerCase() === canonicalModKey);
                });

                if (existingInTx) {
                    const existingData = { id: existingInTx.id, ...existingInTx.data() } as ModProject;
                    const isArchived = existingData.isArchived === true || existingData.lifecycleStatus === 'ARCHIVED' || existingData.isActive === false;
                    return {
                        docId: existingInTx.id,
                        job: null as any,
                        conflictCode: isArchived ? 'STALE_ARCHIVED_RECORD' : 'ALREADY_EXISTS',
                        conflictDoc: existingData
                    };
                }

                // 2. READ: Prepare sync job coalescing check (reads existing PENDING/RUNNING jobs)
                const newModDocRef = adminDb.collection('mod_projects').doc();
                const preparedJob = await prepareSyncJobInTx(tx, newModDocRef.id, userId, 'INITIAL_SYNC');

                // 3. ALL READS COMPLETE. NOW PERFORM ALL WRITES:
                tx.set(newModDocRef, newMod);
                const syncJob = applySyncJobInTx(tx, preparedJob);

                return { docId: newModDocRef.id, job: syncJob };
            });
        } catch (txErr) {
            const errorMsg = txErr instanceof Error ? txErr.message : 'Unknown transaction error';
            console.error('[POST /api/mods] Firestore transaction failed:', {
                error: errorMsg,
                modKey: cleanModKey,
                userId
            });
            return NextResponse.json({ error: 'Mod kaydedilirken sunucu hatası oluştu.' }, { status: 500 });
        }

        if (transactionResult.conflictCode === 'STALE_ARCHIVED_RECORD') {
            return NextResponse.json(
                {
                    error: 'Bu Mod ID için eski bir arşiv kaydı mevcut. Yeni mod eklemeden önce eski kaydı kalıcı olarak temizleyin.',
                    code: 'STALE_ARCHIVED_RECORD',
                    modId: transactionResult.docId,
                    modKey: transactionResult.conflictDoc?.modKey || cleanModKey
                },
                { status: 409 }
            );
        }

        if (transactionResult.conflictCode === 'ALREADY_EXISTS') {
            return NextResponse.json(
                {
                    data: transactionResult.conflictDoc,
                    alreadyExisted: true,
                    message: 'Bu Mod ID zaten mevcut. Mevcut kayıt korundu.'
                },
                { status: 200 }
            );
        }

        const { docId, job } = transactionResult;

        // Best-effort immediate execution in background worker
        try {
            after(async () => {
                try {
                    await processSyncJob(job.id, 'initial-mod-sync-worker');
                } catch (e) {
                    console.warn(`[initModSync] Initial sync job ${job.id} failed:`, e);
                }
            });
        } catch {
            // Outside request context; cron will reconcile
        }

        return NextResponse.json({
            data: { id: docId, ...newMod },
            syncState: 'QUEUED',
            jobId: job.id,
            message: 'Mod kaydedildi. İlk allowlist senkronizasyonu kuyruğa alındı.'
        }, { status: 201 });
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error in POST /api/mods:', errorMsg);
        return NextResponse.json({ error: 'Mod kaydedilirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
