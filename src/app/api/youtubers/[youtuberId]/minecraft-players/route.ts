import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
    validateMinecraftUsername,
    validateMinecraftUuid,
    normalizeUuid,
    RelationshipType
} from '@/lib/minecraft-players';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string }> }
) {
    try {
        const { youtuberId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        // Verify YouTuber exists and belongs to user
        const youtuberSnap = await adminDb.collection('youtubers').doc(youtuberId).get();
        if (!youtuberSnap.exists) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        if (!authUser.isSystemAdmin && youtuberSnap.data()?.userId !== userId) {
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
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

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

        if (!authUser.isSystemAdmin && youtuberSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const canonicalUuid = normalizeUuid(uuid as string);
        const trimmedUsername = (username as string).trim();
        const now = Date.now();

        // 1. Find or create global MinecraftPlayer
        let playerId: string;
        const playerSnap = await adminDb
            .collection('minecraft_players')
            .where('uuid', '==', canonicalUuid)
            .get();

        if (!playerSnap.empty) {
            const pDoc = playerSnap.docs[0];
            playerId = pDoc.id;
            if (pDoc.data().username !== trimmedUsername) {
                await adminDb.collection('minecraft_players').doc(playerId).update({
                    username: trimmedUsername,
                    updatedAt: now
                });
            }
        } else {
            const newPlayerDoc = await adminDb.collection('minecraft_players').add({
                username: trimmedUsername,
                uuid: canonicalUuid,
                createdAt: now,
                updatedAt: now
            });
            playerId = newPlayerDoc.id;
        }

        // 2. Check duplicate association
        const dupSnap = await adminDb
            .collection('youtuber_minecraft_players')
            .where('userId', '==', userId)
            .where('youtuberId', '==', youtuberId)
            .where('minecraftPlayerId', '==', playerId)
            .get();

        if (!dupSnap.empty) {
            return NextResponse.json({ error: 'Bu Minecraft oyuncusu zaten bu YouTuber’a bağlı.' }, { status: 409 });
        }

        const primaryFlag = typeof isPrimary === 'boolean' ? isPrimary : relationshipType === 'owner';
        if (primaryFlag) {
            const prevPrimarySnap = await adminDb
                .collection('youtuber_minecraft_players')
                .where('userId', '==', userId)
                .where('youtuberId', '==', youtuberId)
                .where('isPrimary', '==', true)
                .get();

            for (const doc of prevPrimarySnap.docs) {
                await doc.ref.update({ isPrimary: false, updatedAt: now });
            }
        }

        const assocRef = await adminDb.collection('youtuber_minecraft_players').add({
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

        return NextResponse.json({
            data: {
                associationId: assocRef.id,
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
                    uuid: canonicalUuid,
                    createdAt: now,
                    updatedAt: now
                }
            }
        }, { status: 201 });
    } catch (e: unknown) {
        console.error('API Error in POST players:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'İşlem sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
