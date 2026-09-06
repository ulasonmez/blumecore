import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
    updateYoutuberPlayer,
    deleteYoutuberPlayerAssociation,
    validateMinecraftUsername,
    validateMinecraftUuid,
    normalizeUuid,
    RelationshipType
} from '@/lib/minecraft-players';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string; associationId: string }> }
) {
    try {
        const { youtuberId, associationId } = await context.params;
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.' }, { status: 401 });
        }

        const body = await request.json();
        const { username, uuid, relationshipType, isPrimary, isActive, note } = body;

        // Validation
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

        // Verify association exists and belongs to youtuber and user
        const assocRef = doc(db, 'youtuber_minecraft_players', associationId);
        const assocSnap = await getDoc(assocRef);
        if (!assocSnap.exists()) {
            return NextResponse.json({ error: 'Oyuncu ilişkisi bulunamadı.' }, { status: 404 });
        }

        const assocData = assocSnap.data();
        if (assocData.youtuberId !== youtuberId) {
            return NextResponse.json({ error: 'Bu ilişki belirtilen YouTuber’a ait değil.' }, { status: 400 });
        }

        if (assocData.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        const updated = await updateYoutuberPlayer({
            associationId,
            youtuberId,
            userId,
            username,
            uuid: normalizeUuid(uuid),
            relationshipType,
            isPrimary: !!isPrimary,
            isActive: isActive !== false,
            note
        });

        return NextResponse.json({ data: updated });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'İşlem sırasında bir hata oluştu.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ youtuberId: string; associationId: string }> }
) {
    try {
        const { youtuberId, associationId } = await context.params;
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.' }, { status: 401 });
        }

        const assocRef = doc(db, 'youtuber_minecraft_players', associationId);
        const assocSnap = await getDoc(assocRef);
        if (!assocSnap.exists()) {
            return NextResponse.json({ error: 'Oyuncu ilişkisi bulunamadı.' }, { status: 404 });
        }

        const assocData = assocSnap.data();
        if (assocData.youtuberId !== youtuberId) {
            return NextResponse.json({ error: 'Bu ilişki belirtilen YouTuber’a ait değil.' }, { status: 400 });
        }

        if (assocData.userId !== userId) {
            return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
        }

        await deleteYoutuberPlayerAssociation(associationId, youtuberId);

        return NextResponse.json({ success: true, message: 'Oyuncu bağlantısı başarıyla kaldırıldı.' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'İşlem sırasında bir hata oluştu.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
