import { adminDb } from './firebase-admin';

export type AuditEventType =
    | 'PLAYER_ADDED'
    | 'PLAYER_UPDATED'
    | 'PLAYER_UUID_CHANGED'
    | 'PLAYER_ACTIVATED'
    | 'PLAYER_DEACTIVATED'
    | 'PLAYER_DELETED'
    | 'PLAYER_RESTORED'
    | 'REPOSITORY_PROVISION_ATTEMPT'
    | 'REPOSITORY_PROVISION_SUCCESS'
    | 'REPOSITORY_PROVISION_FAILED'
    | 'REPOSITORY_PROVISION_LINKED_EXISTING'
    | 'REPOSITORY_PROVISION_FIRESTORE_FAILED'
    | 'MOD_ARCHIVED'
    | 'MOD_RESTORED'
    | 'MOD_DELETED'
    | 'DATA_CONFLICT_DETECTED';

export interface AuditLogEntry {
    eventType: AuditEventType;
    actorUserId: string;
    timestamp: number;
    youtuberId?: string;
    playerId?: string;
    oldUuidHash?: string | null;
    newUuidHash?: string | null;
    affectedModIds?: string[];
    queuedJobIds?: string[];
    modId?: string;
    owner?: string;
    details?: Record<string, unknown>;
}

/**
 * Safely masks a Minecraft UUID to prevent logging raw PII/UUIDs in standard logs.
 * Example: '550e8400-e29b-41d4-a716-446655440000' -> '550e****0000'
 */
export function maskUuid(rawUuid: string | null | undefined): string | null {
    if (!rawUuid || typeof rawUuid !== 'string') return null;
    const clean = rawUuid.trim();
    if (clean.length < 8) return '****';
    const start = clean.slice(0, 4);
    const end = clean.slice(-4);
    return `${start}****${end}`;
}

/**
 * Writes an audit record to the `audit_logs` collection.
 * Catches any write error so audit logging never crashes the primary operation.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
    try {
        await adminDb.collection('audit_logs').add({
            ...entry,
            timestamp: entry.timestamp || Date.now()
        });
    } catch (err) {
        // Safe failover: do not fail application operation if audit write fails
        console.warn('[audit-log] Failed to write audit log entry:', err instanceof Error ? err.message : 'Unknown error');
    }
}
