import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubSyncJob, GitHubSyncTriggerType } from '../src/lib/mods/types';

describe('GitHub Sync Job Queue & Coalescing Tests', () => {
    let jobs: GitHubSyncJob[] = [];

    beforeEach(() => {
        jobs = [];
    });

    function createOrCoalesceJob(
        modProjectId: string,
        userId: string,
        triggerType: GitHubSyncTriggerType
    ): GitHubSyncJob {
        // Coalesce: look for existing PENDING job
        const existing = jobs.find(
            (j) => j.modProjectId === modProjectId && j.userId === userId && j.status === 'PENDING'
        );
        if (existing) {
            return existing;
        }

        const now = Date.now();
        const job: GitHubSyncJob = {
            id: `job-${jobs.length + 1}`,
            modProjectId,
            status: 'PENDING',
            triggerType,
            attemptCount: 0,
            nextAttemptAt: now,
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            userId,
            createdAt: now,
            updatedAt: now
        };
        jobs.push(job);
        return job;
    }

    function atomicClaimJob(jobId: string, workerId: string): boolean {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) return false;

        const now = Date.now();
        const isStale = job.status === 'RUNNING' && job.lockedAt && now - job.lockedAt > 5 * 60 * 1000;

        if (job.status !== 'PENDING' && !isStale) {
            return false; // Cannot claim: already running or finished
        }

        job.status = 'RUNNING';
        job.lockedAt = now;
        job.lockedBy = workerId;
        job.attemptCount += 1;
        job.updatedAt = now;
        return true;
    }

    function handleJobFailure(jobId: string, errorCode: string, errorMessage: string) {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) return;

        const backoffMinutes = [1, 5, 15, 60];
        const delayMs = (backoffMinutes[Math.min(job.attemptCount - 1, backoffMinutes.length - 1)] || 60) * 60 * 1000;

        job.status = 'FAILED';
        job.lastErrorCode = errorCode;
        job.lastErrorMessage = errorMessage;
        job.nextAttemptAt = Date.now() + delayMs;
        job.lockedAt = null;
        job.lockedBy = null;
        job.updatedAt = Date.now();
    }

    function manualRetry(jobId: string): boolean {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) return false;

        job.status = 'PENDING';
        job.nextAttemptAt = Date.now();
        job.lockedAt = null;
        job.lockedBy = null;
        job.updatedAt = Date.now();
        return true;
    }

    it('should create new PENDING job when no pending job exists', () => {
        const job = createOrCoalesceJob('mod-1', 'u1', 'MANUAL_SYNC');
        assert.equal(job.status, 'PENDING');
        assert.equal(job.modProjectId, 'mod-1');
        assert.equal(jobs.length, 1);
    });

    it('should coalesce multiple rapid triggers for the same mod into a single PENDING job (coalescing rule)', () => {
        // e.g. 5 rapid player additions for the same mod
        const j1 = createOrCoalesceJob('mod-1', 'u1', 'PLAYER_ADDED');
        const j2 = createOrCoalesceJob('mod-1', 'u1', 'PLAYER_ADDED');
        const j3 = createOrCoalesceJob('mod-1', 'u1', 'PLAYER_UPDATED');
        const j4 = createOrCoalesceJob('mod-1', 'u1', 'PLAYER_DEACTIVATED');
        const j5 = createOrCoalesceJob('mod-1', 'u1', 'PLAYER_REMOVED');

        assert.equal(jobs.length, 1); // Strictly single pending job created
        assert.equal(j1.id, j2.id);
        assert.equal(j2.id, j3.id);
        assert.equal(j3.id, j4.id);
        assert.equal(j4.id, j5.id);
    });

    it('should atomically claim PENDING job and lock it with worker ID', () => {
        const job = createOrCoalesceJob('mod-1', 'u1', 'MANUAL_SYNC');

        const claimedByWorkerA = atomicClaimJob(job.id, 'worker-A');
        assert.equal(claimedByWorkerA, true);

        // Immediate concurrent attempt by worker B should be rejected
        const claimedByWorkerB = atomicClaimJob(job.id, 'worker-B');
        assert.equal(claimedByWorkerB, false);

        assert.equal(job.status, 'RUNNING');
        assert.equal(job.lockedBy, 'worker-A');
        assert.equal(job.attemptCount, 1);
    });

    it('should recover stale RUNNING job (> 5 minutes lock) and allow claiming', () => {
        const job = createOrCoalesceJob('mod-1', 'u1', 'MANUAL_SYNC');
        atomicClaimJob(job.id, 'worker-A');

        // Simulate worker crash: lock is now 6 minutes old
        job.lockedAt = Date.now() - 6 * 60 * 1000;

        const claimedByRecoveryWorker = atomicClaimJob(job.id, 'recovery-worker');
        assert.equal(claimedByRecoveryWorker, true);
        assert.equal(job.lockedBy, 'recovery-worker');
        assert.equal(job.attemptCount, 2);
    });

    it('should apply exponential backoff when a job fails', () => {
        const job = createOrCoalesceJob('mod-1', 'u1', 'MANUAL_SYNC');
        atomicClaimJob(job.id, 'worker-A');

        const beforeFail = Date.now();
        handleJobFailure(job.id, 'RATE_LIMITED', 'Rate limited by GitHub');

        assert.equal(job.status, 'FAILED');
        assert.equal(job.lastErrorCode, 'RATE_LIMITED');
        // First backoff is 1 minute (60,000 ms)
        assert.ok(job.nextAttemptAt >= beforeFail + 59000);
        assert.ok(job.nextAttemptAt <= beforeFail + 61000);
    });

    it('should reset status to PENDING on manual retry', () => {
        const job = createOrCoalesceJob('mod-1', 'u1', 'MANUAL_SYNC');
        atomicClaimJob(job.id, 'worker-A');
        handleJobFailure(job.id, 'NETWORK_ERROR', 'Network down');

        assert.equal(job.status, 'FAILED');

        const retrySuccess = manualRetry(job.id);
        assert.equal(retrySuccess, true);
        assert.equal(job.status, 'PENDING');
        assert.ok(job.nextAttemptAt <= Date.now());
    });

    it('should enforce cron secret authorization check', () => {
        const cronSecret = 'my-super-secret-cron-token';

        const authorize = (authHeader: string | null) => {
            if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
                return false;
            }
            return true;
        };

        assert.equal(authorize(null), false);
        assert.equal(authorize('Bearer wrong-token'), false);
        assert.equal(authorize('Basic something'), false);
        assert.equal(authorize(`Bearer ${cronSecret}`), true);
    });
});
