import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import {
    provisionGitHubRepository,
    validateModRepositoryName,
    DEFAULT_ALLOWED_OWNER,
    GitHubApiError
} from '@/lib/github/client';
import { ModProject } from '@/lib/mods/types';
import { logAudit } from '@/lib/audit-log';

// In-memory locks to prevent parallel creation requests for the same mod ID
const activeProvisioningLocks = new Set<string>();

// Simple sliding-window rate limiter per user: max 5 creations per 60 seconds
const userRateLimits = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 5;

    const timestamps = (userRateLimits.get(userId) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
        return false;
    }
    timestamps.push(now);
    userRateLimits.set(userId, timestamps);
    return true;
}

export async function POST(request: NextRequest) {
    const auth = await requireOwnerUser(request);
    if (!auth.ok) {
        return auth.response;
    }
    const userId = auth.user.userId;

    // Rate limit check
    if (!checkRateLimit(userId)) {
        return NextResponse.json(
            { error: 'Repository oluşturma istek sınırı aşıldı. Lütfen bir dakika bekleyin.' },
            { status: 429 }
        );
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
    }

    const { modId, description } = body || {};
    const rawModId = typeof modId === 'string' ? modId.trim() : '';

    // Validate Mod ID strictly
    try {
        validateModRepositoryName(rawModId);
    } catch (valErr) {
        return NextResponse.json(
            { error: valErr instanceof Error ? valErr.message : 'Geçersiz Mod ID formatı.' },
            { status: 400 }
        );
    }

    // Owner is strictly server-enforced GITHUB_ALLOWED_OWNER (never accepted from request body)
    const owner = process.env.GITHUB_ALLOWED_OWNER || DEFAULT_ALLOWED_OWNER;
    const lockKey = `${userId}:${rawModId}`;

    // Parallel creation prevention
    if (activeProvisioningLocks.has(lockKey)) {
        return NextResponse.json(
            { error: `Bu mod (${rawModId}) için şu anda devam eden bir repository oluşturma işlemi var.` },
            { status: 409 }
        );
    }

    activeProvisioningLocks.add(lockKey);

    await logAudit({
        eventType: 'REPOSITORY_PROVISION_ATTEMPT',
        actorUserId: userId,
        timestamp: Date.now(),
        modId: rawModId,
        owner
    });

    try {
        // Check if ModProject already exists for this user in Firestore
        const canonicalModKey = rawModId.toLowerCase();
        const existingSnap = await adminDb
            .collection('mod_projects')
            .where('userId', '==', userId)
            .get();

        const existingDoc = existingSnap.docs.find((d) => {
            const data = d.data();
            return data.canonicalModKey === canonicalModKey || (data.modKey && data.modKey.toLowerCase() === canonicalModKey);
        });

        if (existingDoc) {
            const existingData = { id: existingDoc.id, ...existingDoc.data() } as ModProject;
            const isArchived = existingData.isArchived === true || existingData.lifecycleStatus === 'ARCHIVED' || existingData.isActive === false;

            if (isArchived) {
                return NextResponse.json(
                    {
                        error: 'Bu Mod ID için eski bir arşiv kaydı mevcut. Yeni mod eklemeden önce eski kaydı kalıcı olarak temizleyin.',
                        code: 'STALE_ARCHIVED_RECORD',
                        modId: existingDoc.id,
                        modKey: existingData.modKey
                    },
                    { status: 409 }
                );
            }

            return NextResponse.json(
                {
                    success: true,
                    data: {
                        id: existingDoc.id,
                        mod: existingData,
                        repositoryUrl: `https://github.com/${owner}/${rawModId}`,
                        branch: existingData.branch || 'main',
                        alreadyExisted: true
                    }
                },
                { status: 200 }
            );
        }

        // Provision repository and verify README on GitHub
        const provisionResult = await provisionGitHubRepository({
            modId: rawModId,
            description: typeof description === 'string' ? description.trim() : undefined
        });

        // Save ModProject to Firestore
        const now = Date.now();
        const effectiveBranch = provisionResult.defaultBranch || 'main';
        const newModData: Omit<ModProject, 'id'> = {
            modKey: rawModId,
            canonicalModKey: rawModId.toLowerCase(),
            displayName: rawModId,
            description: typeof description === 'string' ? description.trim() : '',
            githubOwner: owner,
            githubRepository: rawModId,
            branch: effectiveBranch,
            allowlistPath: 'README.md',
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

        let docRefId = '';
        let initialJobId: string | null = null;
        try {
            const { prepareSyncJobInTx, applySyncJobInTx, processSyncJob } = await import('@/lib/mods/mod-service');
            const res = await adminDb.runTransaction(async (tx) => {
                const modRef = adminDb.collection('mod_projects').doc();

                // 1. ALL READS: Read pending/running sync jobs for coalescing before writing
                const preparedJob = await prepareSyncJobInTx(tx, modRef.id, userId, 'INITIAL_SYNC');

                // 2. ALL WRITES: Execute writes strictly after all reads
                tx.set(modRef, newModData);
                const syncJob = applySyncJobInTx(tx, preparedJob);

                return { id: modRef.id, jobId: syncJob.id };
            });
            docRefId = res.id;
            initialJobId = res.jobId;

            try {
                const { after } = await import('next/server');
                after(async () => {
                    try {
                        await processSyncJob(initialJobId!, 'provision-initial-sync-worker');
                    } catch (e) {
                        console.warn(`[provisionInitialSync] Job ${initialJobId} failed:`, e);
                    }
                });
            } catch {
                // Not in request context
            }
        } catch (firestoreErr) {
            // Partial failure: GitHub repo was created, but Firestore record failed.
            // DO NOT delete repository on GitHub!
            await logAudit({
                eventType: 'REPOSITORY_PROVISION_FIRESTORE_FAILED',
                actorUserId: userId,
                timestamp: Date.now(),
                modId: rawModId,
                owner,
                details: {
                    error: firestoreErr instanceof Error ? firestoreErr.message : 'Firestore error'
                }
            });

            return NextResponse.json(
                {
                    error: 'Repository oluşturuldu ancak BlumeCore kaydı tamamlanamadı. Yeniden içe aktarabilirsiniz.',
                    partialFailure: true,
                    repositoryUrl: provisionResult.repositoryUrl,
                    branch: effectiveBranch,
                    readmeSha: provisionResult.readmeSha
                },
                { status: 500 }
            );
        }

        await logAudit({
            eventType: provisionResult.alreadyExisted
                ? 'REPOSITORY_PROVISION_LINKED_EXISTING'
                : 'REPOSITORY_PROVISION_SUCCESS',
            actorUserId: userId,
            timestamp: Date.now(),
            modId: rawModId,
            owner,
            details: {
                docId: docRefId,
                branch: effectiveBranch,
                readmeSha: provisionResult.readmeSha
            }
        });

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: docRefId,
                    mod: { id: docRefId, ...newModData },
                    repositoryUrl: provisionResult.repositoryUrl,
                    branch: effectiveBranch,
                    readmeSha: provisionResult.readmeSha,
                    alreadyExisted: provisionResult.alreadyExisted,
                    jobId: initialJobId,
                    syncState: 'QUEUED'
                }
            },
            { status: 201 }
        );
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Repository oluşturulurken bir hata oluştu.';
        const statusCode = err instanceof GitHubApiError ? err.statusCode : 500;

        await logAudit({
            eventType: 'REPOSITORY_PROVISION_FAILED',
            actorUserId: userId,
            timestamp: Date.now(),
            modId: rawModId,
            owner,
            details: { error: errorMsg }
        });

        return NextResponse.json({ error: errorMsg }, { status: statusCode });
    } finally {
        activeProvisioningLocks.delete(lockKey);
    }
}
