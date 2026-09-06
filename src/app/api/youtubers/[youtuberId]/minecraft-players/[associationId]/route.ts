import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
    validateMinecraftUsername,
    validateMinecraftUuid,
    normalizeUuid,
    RelationshipType
} from '@/lib/minecraft-players';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string; associationId: string }> }
) {
    try {
        const { youtuberId, associationId } = await context.params;
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

        if (!authUser.isSystemAdmin && assocData?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const canonicalUuid = normalizeUuid(uuid as string);
        const trimmedUsername = (username as string).trim();
        const now = Date.now();

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

        return NextResponse.json({
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
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        const assocRef = adminDb.collection('youtuber_minecraft_players').doc(associationId);
        const assocSnap = await assocRef.get();
        if (!assocSnap.exists) {
            return NextResponse.json({ error: 'Oyuncu ilişkisi bulunamadı.' }, { status: 404 });
        }

        const assocData = assocSnap.data();
        if (assocData?.youtuberId !== youtuberId) {
            return NextResponse.json({ error: 'Bu ilişki belirtilen YouTuber’a ait değil.' }, { status: 400 });
        }

        if (!authUser.isSystemAdmin && assocData?.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        await assocRef.delete();

        return NextResponse.json({ success: true, message: 'Oyuncu bağlantısı başarıyla kaldırıldı.' });
    } catch (e: unknown) {
        console.error('API Error in DELETE association:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'İşlem sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
