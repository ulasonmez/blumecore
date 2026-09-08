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

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string }> }
) {
    try {
        const { youtuberId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        // Verify YouTuber exists and belongs to user
        const youtuberSnap = await adminDb.collection('youtubers').doc(youtuberId).get();
        if (!youtuberSnap.exists) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        if (youtuberSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const assocSnap = await adminDb
            .collection('youtuber_minecraft_players')
            .where('youtuberId', '==', youtuberId)
            .where('userId', '==', userId)
            .get();

        const players = [];
        for (const aDoc of assocSnap.docs) {
            const aData = aDoc.data();
            const pSnap = await adminDb.collection('minecraft_players').doc(aData.minecraftPlayerId).get();
            if (pSnap.exists) {
                const pData = pSnap.data();
                players.push({
                    associationId: aDoc.id,
                    youtuberId,
                    relationshipType: aData.relationshipType,
                    isPrimary: aData.isPrimary,
                    isActive: aData.isActive,
                    note: aData.note || null,
                    createdAt: aData.createdAt || Date.now(),
                    updatedAt: aData.updatedAt || Date.now(),
                    player: {
                        id: pSnap.id,
                        username: pData?.username,
                        uuid: pData?.uuid,
                        createdAt: pData?.createdAt || Date.now(),
                        updatedAt: pData?.updatedAt || Date.now()
                    }
                });
            }
        }

        return NextResponse.json({ data: players });
    } catch (e: unknown) {
        console.error('API Error in GET players:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json(
            { error: 'Sunucu hatası oluştu. Lütfen tekrar deneyin.' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string }> }
) {
    try {
        const { youtuberId } = await context.params;
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

        // Server-side validation
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

        // Verify YouTuber exists and belongs to user
        const youtuberSnap = await adminDb.collection('youtubers').doc(youtuberId).get();
        if (!youtuberSnap.exists) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        if (youtuberSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const canonicalUuid = normalizeUuid(uuid as string);
        const trimmedUsername = (username as string).trim();
        const now = Date.now();

        const primaryFlag = typeof isPrimary === 'boolean' ? isPrimary : relationshipType === 'owner';
        let assocId = '';
        let playerId = '';
        let syncSummary: {
            success: boolean;
            playerId?: string;
            affectedModCount: number;
            queuedJobCount: number;
            coalescedJobCount: number;
            legacyConflicts: { modId: string; reason: string }[];
            affectedModIds: string[];
            queuedJobIds: string[];
        } = {
            success: true,
            playerId: '',
            affectedModCount: 0,
            queuedJobCount: 0,
            coalescedJobCount: 0,
            legacyConflicts: [],
            affectedModIds: [],
            queuedJobIds: []
        };

        try {
            await adminDb.runTransaction(async (tx) => {
                // 1. Find or create global MinecraftPlayer
                const playerSnap = await adminDb
                    .collection('minecraft_players')
                    .where('uuid', '==', canonicalUuid)
                    .get();

                let pRef: FirebaseFirestore.DocumentReference;
                if (!playerSnap.empty) {
                    const pDoc = playerSnap.docs[0];
                    playerId = pDoc.id;
                    pRef = pDoc.ref;
                    if (pDoc.data().username !== trimmedUsername) {
                        tx.update(pRef, {
                            username: trimmedUsername,
                            updatedAt: now
                        });
                    }
                } else {
                    pRef = adminDb.collection('minecraft_players').doc();
                    playerId = pRef.id;
                    tx.set(pRef, {
                        username: trimmedUsername,
                        uuid: canonicalUuid,
                        createdAt: now,
                        updatedAt: now
                    });
                }

                // 2. Check duplicate association
                const dupSnap = await adminDb
                    .collection('youtuber_minecraft_players')
                    .where('userId', '==', userId)
                    .where('youtuberId', '==', youtuberId)
                    .where('minecraftPlayerId', '==', playerId)
                    .get();

                if (!dupSnap.empty) {
                    throw new Error('DUPLICATE_ASSOCIATION:Bu Minecraft oyuncusu zaten bu YouTuber’a bağlı.');
                }

                // 3. Update previous primary flag
                if (primaryFlag) {
                    const prevPrimarySnap = await adminDb
                        .collection('youtuber_minecraft_players')
                        .where('userId', '==', userId)
                        .where('youtuberId', '==', youtuberId)
                        .where('isPrimary', '==', true)
                        .get();

                    for (const doc of prevPrimarySnap.docs) {
                        tx.update(doc.ref, { isPrimary: false, updatedAt: now });
                    }
                }

                const assocRef = adminDb.collection('youtuber_minecraft_players').doc();
                assocId = assocRef.id;
                tx.set(assocRef, {
                    userId,
                    youtuberId,
                    minecraftPlayerId: playerId,
                    relationshipType,
                    isPrimary: primaryFlag,
                    isActive: typeof isActive === 'boolean' ? isActive : true,
                    note: typeof note === 'string' ? note.trim() : null,
                    createdAt: now,
                    updatedAt: now
                });

                // 4. Atomically queue sync jobs in the same transaction
                syncSummary = await syncActiveModsForYoutuberChange({
                    youtuberId,
                    userId,
                    triggerType: 'PLAYER_ADDED',
                    playerId,
                    changedUuid: canonicalUuid,
                    tx
                });
            });
        } catch (txErr: unknown) {
            const msg = txErr instanceof Error ? txErr.message : 'İşlem sırasında hata oluştu.';
            if (msg.startsWith('DUPLICATE_ASSOCIATION:')) {
                return NextResponse.json({ error: msg.replace('DUPLICATE_ASSOCIATION:', '') }, { status: 409 });
            }
            throw txErr;
        }

        // 5. Reliable worker execution: execute jobs and await before sending response (no orphan promises)
        let allSynced = true;
        const { processSyncJob } = await import('@/lib/mods/mod-service');
        for (const jId of syncSummary.queuedJobIds) {
            try {
                const res = await processSyncJob(jId, 'player-add-worker');
                if (!res.success) allSynced = false;
            } catch {
                allSynced = false;
            }
        }

        // Audit log
        await logAudit({
            eventType: 'PLAYER_ADDED',
            actorUserId: userId,
            timestamp: now,
            youtuberId,
            playerId,
            newUuidHash: maskUuid(canonicalUuid),
            affectedModIds: syncSummary.affectedModIds,
            queuedJobIds: syncSummary.queuedJobIds
        });

        return NextResponse.json({
            success: true,
            playerId,
            syncState: allSynced ? 'SYNCED' : 'QUEUED',
            affectedModCount: syncSummary.affectedModCount,
            queuedJobCount: syncSummary.queuedJobCount,
            coalescedJobCount: syncSummary.coalescedJobCount,
            legacyConflicts: syncSummary.legacyConflicts,
            data: {
                associationId: assocId,
                youtuberId,
                relationshipType,
                isPrimary: primaryFlag,
                isActive: typeof isActive === 'boolean' ? isActive : true,
                note: typeof note === 'string' ? note.trim() : null,
                createdAt: now,
                updatedAt: now,
                player: {
                    id: playerId,
                    username: trimmedUsername,
                    uuid: canonicalUuid
                }
            }
        }, { status: 201 });
    } catch (e: unknown) {
        console.error('API Error in POST players:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'İşlem sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
