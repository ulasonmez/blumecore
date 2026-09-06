import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
    addPlayerToYoutuber,
    validateMinecraftUsername,
    validateMinecraftUuid,
    normalizeUuid,
    RelationshipType,
    parseDate
} from '@/lib/minecraft-players';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string }> }
) {
    try {
        const { youtuberId } = await context.params;
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.' }, { status: 401 });
        }

        // Verify YouTuber exists and belongs to user
        const youtuberSnap = await getDoc(doc(db, 'youtubers', youtuberId));
        if (!youtuberSnap.exists()) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        if (youtuberSnap.data().userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const qAssoc = query(
            collection(db, 'youtuber_minecraft_players'),
            where('youtuberId', '==', youtuberId),
            where('userId', '==', userId)
        );
        const assocSnap = await getDocs(qAssoc);

        const players = [];
        for (const aDoc of assocSnap.docs) {
            const aData = aDoc.data();
            const pSnap = await getDoc(doc(db, 'minecraft_players', aData.minecraftPlayerId));
            if (pSnap.exists()) {
                const pData = pSnap.data();
                players.push({
                    associationId: aDoc.id,
                    youtuberId,
                    relationshipType: aData.relationshipType,
                    isPrimary: aData.isPrimary,
                    isActive: aData.isActive,
                    note: aData.note || null,
                    createdAt: parseDate(aData.createdAt),
                    updatedAt: parseDate(aData.updatedAt),
                    player: {
                        id: pSnap.id,
                        username: pData.username,
                        uuid: pData.uuid,
                        createdAt: parseDate(pData.createdAt),
                        updatedAt: parseDate(pData.updatedAt)
                    }
                });
            }
        }

        return NextResponse.json({ data: players });
    } catch (e: unknown) {
        console.error('API Error in GET players: [internal error]');
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
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.' }, { status: 401 });
        }

        const body = await request.json();
        const { username, uuid, relationshipType, isPrimary, isActive, note } = body;

        // Server-side validation
        const usernameVal = validateMinecraftUsername(username);
        if (!usernameVal.valid) {
            return NextResponse.json({ error: usernameVal.error }, { status: 400 });
        }

        const uuidVal = validateMinecraftUuid(uuid);
        if (!uuidVal.valid) {
            return NextResponse.json({ error: uuidVal.error }, { status: 400 });
        }

        const validRelationships: RelationshipType[] = ['owner', 'friend', 'team', 'other'];
        if (!validRelationships.includes(relationshipType)) {
            return NextResponse.json({ error: 'Geçersiz ilişki türü.' }, { status: 400 });
        }

        // Verify YouTuber exists and belongs to user
        const youtuberSnap = await getDoc(doc(db, 'youtubers', youtuberId));
        if (!youtuberSnap.exists()) {
            return NextResponse.json({ error: 'YouTuber bulunamadı.' }, { status: 404 });
        }

        if (youtuberSnap.data().userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const enriched = await addPlayerToYoutuber({
            youtuberId,
            userId,
            username,
            uuid: normalizeUuid(uuid),
            relationshipType,
            isPrimary,
            isActive,
            note
        });

        return NextResponse.json({ data: enriched }, { status: 201 });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'İşlem sırasında bir hata oluştu.';
        if (message.includes('zaten bu YouTuber’a bağlı')) {
            return NextResponse.json({ error: message }, { status: 409 });
        }
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
