import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
    validateMinecraftUsername,
    validateMinecraftUuid,
    normalizeUuid,
    RelationshipType
} from '@/lib/minecraft-players';
import { requireOwnerUser } from '@/lib/server-auth';
import { syncActiveModsForYoutuberChange } from '@/lib/mods/mod-service';
import { logAudit, maskUuid } from '@/lib/audit-log';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string; associationId: string }> }
) {
    try {
        const { youtuberId, associationId } = await context.params;
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

        const { username, uuid, relationshipType, isPrimary, isActive, note } = body;

        // Validation
        const usernameVal = validateMinecraftUsername(typeof username === 'string' ? username : '');
        if (!usernameVal.valid) {
            return NextResponse.json({ error: usernameVal.error }, { status: 400 });
        }

        const uuidVal = validateMinecraftUuid(typeof uuid === 'string' ? uuid : '');
        if (!uuidVal.valid) {
            return NextResponse.json({ error: uuidVal.error }, { status: 400 });
        }

        const validRelationships: RelationshipType[] = ['owner', 'friend', 'team', 'other'];
        if (!validRelationships.includes(relationshipType as RelationshipType)) {
            return NextResponse.json({ error: 'Geçersiz ilişki türü.' }, { status: 400 });
        }

        // Verify association exists and belongs to youtuber and user
        const assocRef = adminDb.collection('youtuber_minecraft_players').doc(associationId);
        const assocSnap = await assocRef.get();
        if (!assocSnap.exists) {
            return NextResponse.json({ error: 'Oyuncu ilişkisi bulunamadı.' }, { status: 404 });
        }

        const assocData = assocSnap.data();
        if (assocData?.youtuberId !== youtuberId) {
            return NextResponse.json({ error: 'Bu ilişki belirtilen YouTuber’a ait değil.' }, { status: 400 });
        }

        if (assocData?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const canonicalUuid = normalizeUuid(uuid as string);
        const trimmedUsername = (username as string).trim();
        const now = Date.now();

        // Previous state before update
        const prevPlayerSnap = await adminDb.collection('minecraft_players').doc(assocData.minecraftPlayerId).get();
        const oldUuid = prevPlayerSnap.exists ? prevPlayerSnap.data()?.uuid : null;
        const oldIsActive = assocData.isActive !== false;

        // 1. Update or create global player
        let targetPlayerId = assocData.minecraftPlayerId;
        const playerSnap = await adminDb.collection('minecraft_players').doc(targetPlayerId).get();

        if (playerSnap.exists && playerSnap.data()?.uuid === canonicalUuid) {
            if (playerSnap.data()?.username !== trimmedUsername) {
                await adminDb.collection('minecraft_players').doc(targetPlayerId).update({
                    username: trimmedUsername,
                    updatedAt: now
                });
            }
        } else {
            const existingUuidSnap = await adminDb
                .collection('minecraft_players')
                .where('uuid', '==', canonicalUuid)
                .get();

            if (!existingUuidSnap.empty) {
                targetPlayerId = existingUuidSnap.docs[0].id;
                if (existingUuidSnap.docs[0].data().username !== trimmedUsername) {
                    await adminDb.collection('minecraft_players').doc(targetPlayerId).update({
                        username: trimmedUsername,
                        updatedAt: now
                    });
                }
            } else {
                const newDoc = await adminDb.collection('minecraft_players').add({
                    username: trimmedUsername,
                    uuid: canonicalUuid,
                    createdAt: now,
                    updatedAt: now
                });
                targetPlayerId = newDoc.id;
            }
        }

        // 2. Primary player switch
        const primaryFlag = typeof isPrimary === 'boolean' ? isPrimary : relationshipType === 'owner';
        if (primaryFlag) {
            const prevPrimarySnap = await adminDb
                .collection('youtuber_minecraft_players')
                .where('userId', '==', userId)
                .where('youtuberId', '==', youtuberId)
                .where('isPrimary', '==', true)
                .get();

            for (const doc of prevPrimarySnap.docs) {
                if (doc.id !== associationId) {
                    await doc.ref.update({ isPrimary: false, updatedAt: now });
                }
            }
        }

        const activeFlag = typeof isActive === 'boolean' ? isActive : true;
        await assocRef.update({
            minecraftPlayerId: targetPlayerId,
            relationshipType,
            isPrimary: primaryFlag,
            isActive: activeFlag,
            note: typeof note === 'string' ? note.trim() : null,
            updatedAt: now
        });

        // Determine if sync is needed
        const uuidChanged = oldUuid !== canonicalUuid;
        const activeChanged = oldIsActive !== activeFlag;

        let syncSummary = {
            affectedModCount: 0,
            queuedJobCount: 0,
            coalescedJobCount: 0,
            legacyConflicts: [] as { modId: string; reason: string }[],
            affectedModIds: [] as string[],
            queuedJobIds: [] as string[]
        };

        if (uuidChanged || activeChanged) {
            const triggerType = uuidChanged
                ? 'PLAYER_UUID_CHANGED'
                : !activeFlag
                ? 'PLAYER_DEACTIVATED'
                : 'PLAYER_ACTIVATED';

            syncSummary = await syncActiveModsForYoutuberChange({
                youtuberId,
                userId,
                triggerType,
                playerId: targetPlayerId,
                changedUuid: canonicalUuid,
                oldUuid: oldUuid || undefined
            });

            // Reliable worker execution
            const { processSyncJob } = await import('@/lib/mods/mod-service');
            for (const jId of syncSummary.queuedJobIds) {
                try {
                    await processSyncJob(jId, 'player-update-worker');
                } catch (jobErr) {
                    console.warn(`[player-update] Worker failed for ${jId}:`, jobErr);
                }
            }

            await logAudit({
                eventType: triggerType,
                actorUserId: userId,
                timestamp: now,
                youtuberId,
                playerId: targetPlayerId,
                oldUuidHash: maskUuid(oldUuid),
                newUuidHash: maskUuid(canonicalUuid),
                affectedModIds: syncSummary.affectedModIds,
                queuedJobIds: syncSummary.queuedJobIds
            });
        } else {
            // Metadata change only (e.g. nickname, primary, note): no sync job needed
            await logAudit({
                eventType: 'PLAYER_UPDATED',
                actorUserId: userId,
                timestamp: now,
                youtuberId,
                playerId: targetPlayerId,
                oldUuidHash: maskUuid(oldUuid),
                newUuidHash: maskUuid(canonicalUuid)
            });
        }

        return NextResponse.json({
            success: true,
            playerId: targetPlayerId,
            affectedModCount: syncSummary.affectedModCount,
            queuedJobCount: syncSummary.queuedJobCount,
            coalescedJobCount: syncSummary.coalescedJobCount,
            legacyConflicts: syncSummary.legacyConflicts,
            data: {
                associationId,
                youtuberId,
                relationshipType,
                isPrimary: primaryFlag,
                isActive: activeFlag,
                note: typeof note === 'string' ? note.trim() : null,
                player: {
                    id: targetPlayerId,
                    username: trimmedUsername,
                    uuid: canonicalUuid
                }
            }
        });
    } catch (e: unknown) {
        console.error('API Error in PATCH association:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'İşlem sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string; associationId: string }> }
) {
    try {
        const { youtuberId, associationId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        let oldPlayerId = '';
        let oldUuid: string | null = null;
        let syncSummary: {
            affectedModCount: number;
            queuedJobCount: number;
            coalescedJobCount: number;
            legacyConflicts: { modId: string; reason: string }[];
            affectedModIds: string[];
            queuedJobIds: string[];
            playerId?: string;
        } = {
            affectedModCount: 0,
            queuedJobCount: 0,
            coalescedJobCount: 0,
            legacyConflicts: [],
            affectedModIds: [],
            queuedJobIds: []
        };

        const assocRef = adminDb.collection('youtuber_minecraft_players').doc(associationId);

        try {
            await adminDb.runTransaction(async (tx) => {
                const assocSnap = await tx.get(assocRef);
                if (!assocSnap.exists) {
                    throw new Error('NOT_FOUND:Oyuncu ilişkisi bulunamadı.');
                }

                const assocData = assocSnap.data();
                if (assocData?.youtuberId !== youtuberId) {
                    throw new Error('BAD_REQUEST:Bu ilişki belirtilen YouTuber’a ait değil.');
                }

                if (assocData?.userId !== userId) {
                    throw new Error('FORBIDDEN:Bu işlem için yetkiniz yok.');
                }

                oldPlayerId = assocData.minecraftPlayerId;
                const oldPlayerSnap = await tx.get(adminDb.collection('minecraft_players').doc(oldPlayerId));
                oldUuid = oldPlayerSnap.exists ? oldPlayerSnap.data()?.uuid : null;

                // Delete association within transaction
                tx.delete(assocRef);

                // Queue sync jobs atomically in the same transaction
                syncSummary = await syncActiveModsForYoutuberChange({
                    youtuberId,
                    userId,
                    triggerType: 'PLAYER_DELETED',
                    playerId: oldPlayerId,
                    oldUuid: oldUuid || undefined,
                    tx
                });
            });
        } catch (txErr: unknown) {
            const msg = txErr instanceof Error ? txErr.message : 'İşlem sırasında hata oluştu.';
            if (msg.startsWith('NOT_FOUND:')) return NextResponse.json({ error: msg.replace('NOT_FOUND:', '') }, { status: 404 });
            if (msg.startsWith('BAD_REQUEST:')) return NextResponse.json({ error: msg.replace('BAD_REQUEST:', '') }, { status: 400 });
            if (msg.startsWith('FORBIDDEN:')) return NextResponse.json({ error: msg.replace('FORBIDDEN:', '') }, { status: 403 });
            throw txErr;
        }

        // Reliable worker execution: await jobs before returning (no orphan promises)
        let allSynced = true;
        const { processSyncJob } = await import('@/lib/mods/mod-service');
        for (const jId of syncSummary.queuedJobIds) {
            try {
                const res = await processSyncJob(jId, 'player-delete-worker');
                if (!res.success) allSynced = false;
            } catch {
                allSynced = false;
            }
        }

        // Audit log
        await logAudit({
            eventType: 'PLAYER_DELETED',
            actorUserId: userId,
            timestamp: Date.now(),
            youtuberId,
            playerId: oldPlayerId,
            oldUuidHash: maskUuid(oldUuid),
            affectedModIds: syncSummary.affectedModIds,
            queuedJobIds: syncSummary.queuedJobIds
        });

        return NextResponse.json({
            success: true,
            playerId: oldPlayerId,
            syncState: allSynced ? 'SYNCED' : 'QUEUED',
            affectedModCount: syncSummary.affectedModCount,
            queuedJobCount: syncSummary.queuedJobCount,
            coalescedJobCount: syncSummary.coalescedJobCount,
            legacyConflicts: syncSummary.legacyConflicts,
            message: 'Oyuncu bağlantısı başarıyla kaldırıldı.'
        });
    } catch (e: unknown) {
        console.error('API Error in DELETE association:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'İşlem sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
