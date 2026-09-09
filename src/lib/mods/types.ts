export type ModSyncMode = 'LEGACY_README';
export type ModLifecycleStatus = 'ACTIVE' | 'ARCHIVING' | 'ARCHIVED' | 'ARCHIVE_FAILED';
export type ModArchiveStatus = ModLifecycleStatus; // Backward-compatible alias

export interface ModProject {
    id: string;
    modKey: string;
    canonicalModKey?: string;
    displayName: string;
    description?: string;
    githubOwner: string;
    githubRepository: string;
    branch: string;
    allowlistPath: string;
    syncMode: ModSyncMode;
    lifecycleStatus: ModLifecycleStatus;
    archiveError?: string | null;
    syncStatus?: ModSyncStatus;
    lastSuccessfulSyncAt?: number | null;
    lastSuccessfulCommitSha?: string | null;
    userId: string;
    createdAt: number;
    updatedAt: number;
    manualProtectedUuids?: string[];
    // Backward-compatible deprecated fields:
    isActive?: boolean;
    isArchived?: boolean;
    archiveStatus?: ModArchiveStatus;
}

export function resolveModLifecycleStatus(mod: Partial<ModProject>): ModLifecycleStatus {
    if (mod.lifecycleStatus) {
        return mod.lifecycleStatus;
    }
    if (mod.archiveStatus) {
        return mod.archiveStatus;
    }
    if (mod.isArchived === true) {
        return 'ARCHIVED';
    }
    if (mod.isActive === false) {
        return 'ARCHIVED';
    }
    return 'ACTIVE';
}

export interface GlobalMinecraftPlayer {
    id: string;
    username: string;
    uuid: string;
    isActive: boolean;
    description?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface VideoModProject {
    id: string;
    videoId: string;
    modProjectId: string;
    userId: string;
    createdAt: number;
}

export type ModAccessStatus = 'ACTIVE' | 'REVOKED';
export type ModAccessGrantType = 'VIDEO_ASSIGNMENT' | 'MANUAL';
export type ModAccessManualDecision = 'NONE' | 'FORCE_ALLOW' | 'FORCE_DENY';

export interface ModAccessSource {
    type: 'VIDEO_ASSIGNMENT' | 'MANUAL';
    sourceVideoAssignmentId?: string | null;
    videoId?: string | null;
    addedAt: number;
}

export type ModSyncStatus =
    | 'PENDING'
    | 'RUNNING'
    | 'SUCCESS'
    | 'FAILED'
    | 'DRIFTED'
    | 'NO_ACTIVE_PLAYERS';

export interface YoutuberModAccess {
    id: string;
    youtuberId: string;
    modProjectId: string;
    status: ModAccessStatus;
    syncStatus?: ModSyncStatus;
    grantType: ModAccessGrantType;
    grantSources?: ModAccessSource[];
    manualDecision: ModAccessManualDecision;
    sourceVideoAssignmentId?: string | null;
    grantedAt: number;
    grantedByUserId: string;
    revokedAt?: number | null;
    revokedByUserId?: string | null;
    revokeReason?: string | null;
    userId: string;
    createdAt: number;
    updatedAt: number;
}

export type ModAccessEventType =
    | 'AUTO_GRANTED_FROM_VIDEO_ASSIGNMENT'
    | 'MANUAL_GRANTED'
    | 'MANUAL_REVOKED'
    | 'MANUAL_REGRANTED'
    | 'PLAYER_CHANGE_TRIGGERED_SYNC'
    | 'MANUAL_SYNC_REQUESTED';

export interface ModAccessEvent {
    id: string;
    youtuberModAccessId: string;
    modProjectId: string;
    youtuberId: string;
    eventType: ModAccessEventType;
    sourceVideoAssignmentId?: string | null;
    actorUserId: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
}

export type GitHubSyncJobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type GitHubSyncTriggerType =
    | 'INITIAL_SYNC'
    | 'VIDEO_ASSIGNED'
    | 'MANUAL_ACCESS_GRANTED'
    | 'MANUAL_ACCESS_REVOKED'
    | 'PLAYER_ADDED'
    | 'PLAYER_UPDATED'
    | 'PLAYER_ACTIVATED'
    | 'PLAYER_DEACTIVATED'
    | 'PLAYER_UUID_CHANGED'
    | 'PLAYER_REMOVED'
    | 'PLAYER_DELETED'
    | 'GLOBAL_PLAYER_CHANGED'
    | 'MOD_BACKFILL'
    | 'MOD_ARCHIVED'
    | 'MOD_RESTORED'
    | 'LIFECYCLE_CASCADE'
    | 'MANUAL_RETRY'
    | 'MANUAL_SYNC'
    | 'DRIFT_REPAIR'
    | 'CRON_RETRY';

export interface GitHubSyncJob {
    id: string;
    modProjectId: string;
    status: GitHubSyncJobStatus;
    triggerType: GitHubSyncTriggerType;
    attemptCount: number;
    nextAttemptAt: number;
    lockedAt?: number | null;
    lockedBy?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    userId: string;
    createdAt: number;
    startedAt?: number | null;
    completedAt?: number | null;
    updatedAt: number;
}

export type GitHubSyncRunStatus = 'SUCCESS' | 'FAILED' | 'NO_OP' | 'NO_ACTIVE_PLAYERS';

export interface GitHubSyncRun {
    id: string;
    modProjectId: string;
    jobId: string;
    status: GitHubSyncRunStatus;
    desiredUuidCount: number;
    writtenUuidCount: number;
    legacyUuidCount: number;
    commitSha?: string | null;
    previousFileSha?: string | null;
    errorCode?: string | null;
    safeErrorMessage?: string | null;
    satisfiedByLegacy?: boolean;
    startedAt: number;
    completedAt: number;
}

export interface YoutuberAccessSummary {
    access: YoutuberModAccess;
    youtuberName: string;
    activePlayerCount: number;
    players: { uuid: string; username: string; isPrimary: boolean }[];
}

export interface LegacyUuidInfo {
    uuid: string;
    matchedPlayerUsername?: string | null;
    matchedYoutuberName?: string | null;
    isDuplicateInLegacy: boolean;
}

export interface DesiredModState {
    modProjectId: string;
    youtuberGroups: {
        youtuberId: string;
        youtuberName: string;
        players: { uuid: string; username: string }[];
    }[];
    allDesiredUuids: string[];
    legacyConflicts: string[];
}
