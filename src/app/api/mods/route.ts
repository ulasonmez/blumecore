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
            if (status !== 'ARCHIVED') {
                mods.push({ id: d.id, ...data, lifecycleStatus: status });
            }
        });

        // Sort: active first, then newest
        mods.sort((a, b) => {
            const aActive = resolveModLifecycleStatus(a) === 'ACTIVE';
            const bActive = resolveModLifecycleStatus(b) === 'ACTIVE';
            if (aActive !== bActive) return aActive ? -1 : 1;
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
            // Idempotently return existing record without overwriting repository/branch/path
            let queuedJobId: string | null = null;
            try {
                const { createOrCoalesceSyncJob, processSyncJob } = await import('@/lib/mods/mod-service');
                const job = await createOrCoalesceSyncJob(matchedDoc.id, userId, 'INITIAL_SYNC');
                queuedJobId = job.id;
                try {
                    after(async () => {
                        try {
                            await processSyncJob(job.id, 'initial-mod-sync-worker');
                        } catch (e) {
                            console.warn(`[initModSync] Initial sync job ${job.id} failed:`, e);
                        }
                    });
                } catch {
                    // Outside request context
                }
            } catch (jobErr) {
                console.warn('[initModSync] Warning queuing initial sync job for existing mod:', jobErr);
            }

            return NextResponse.json(
                {
                    data: {
                        id: matchedDoc.id,
                        ...matchedDoc.data()
                    },
                    alreadyExisted: true,
                    syncState: 'QUEUED',
                    jobId: queuedJobId,
                    message: 'Bu Mod ID zaten mevcut. Mevcut kayıt korundu.'
                },
                { status: 200 }
            );
        }

        const now = Date.now();
        const newMod: Omit<ModProject, 'id'> = {
            modKey: cleanModKey,
            canonicalModKey,
            displayName: effectiveDisplayName,
            description: typeof description === 'string' ? description.trim() : '',
            githubOwner: owner,
            githubRepository: repo,
            branch: targetBranch,
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

        const { createOrCoalesceSyncJob, processSyncJob } = await import('@/lib/mods/mod-service');

        // Create mod record and INITIAL_SYNC job in the same Firestore transaction
        const { docId, job } = await adminDb.runTransaction(async (tx) => {
            const modDocRef = adminDb.collection('mod_projects').doc();
            tx.set(modDocRef, newMod);

            const syncJob = await createOrCoalesceSyncJob(modDocRef.id, userId, 'INITIAL_SYNC', tx);
            return { docId: modDocRef.id, job: syncJob };
        });

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
        console.error('Error in POST /api/mods:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Mod kaydedilirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
