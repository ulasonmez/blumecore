import {
    collection,
    doc,
    query,
    where,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    Timestamp,
    onSnapshot,
    Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

export type RelationshipType = 'owner' | 'friend' | 'team' | 'other';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
    owner: "YouTuber’ın Kendisi",
    friend: 'Arkadaş',
    team: 'Ekip Üyesi',
    other: 'Diğer'
};

export interface MinecraftPlayer {
    id: string;
    username: string;
    uuid: string; // Canonical lowercase hyphenated (8-4-4-4-12)
    createdAt: Date;
    updatedAt: Date;
}

export interface YoutuberMinecraftPlayer {
    id: string;
    youtuberId: string;
    minecraftPlayerId: string;
    relationshipType: RelationshipType;
    isPrimary: boolean;
    isActive: boolean;
    note?: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface EnrichedYoutuberPlayer {
    associationId: string;
    youtuberId: string;
    relationshipType: RelationshipType;
    isPrimary: boolean;
    isActive: boolean;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
    player: MinecraftPlayer;
}

export interface AddPlayerInput {
    youtuberId: string;
    userId: string;
    username: string;
    uuid: string;
    relationshipType: RelationshipType;
    isPrimary?: boolean;
    isActive?: boolean;
    note?: string;
}

export interface UpdatePlayerInput {
    associationId: string;
    youtuberId: string;
    userId: string;
    username: string;
    uuid: string;
    relationshipType: RelationshipType;
    isPrimary: boolean;
    isActive: boolean;
    note?: string;
}

/**
 * Normalizes UUID to canonical 36-character lowercase hyphenated format:
 * e.g., '550e8400-e29b-41d4-a716-446655440000'
 */
export function normalizeUuid(rawUuid: string): string {
    if (!rawUuid) return '';
    const clean = rawUuid.trim().toLowerCase().replace(/-/g, '');
    if (clean.length !== 32) {
        return rawUuid.trim().toLowerCase();
    }
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

/**
 * Validates a Minecraft UUID.
 * Accepts both 32-char (unhyphenated) and 36-char (hyphenated) hex strings.
 */
export function validateMinecraftUuid(rawUuid: string): { valid: boolean; error?: string } {
    if (!rawUuid || !rawUuid.trim()) {
        return { valid: false, error: 'Minecraft UUID alanı zorunludur.' };
    }
    const clean = rawUuid.trim().toLowerCase().replace(/-/g, '');
    if (clean.length !== 32) {
        return {
            valid: false,
            error: 'Minecraft UUID 32 veya 36 karakter uzunluğunda olmalıdır.'
        };
    }
    if (!/^[0-9a-f]{32}$/.test(clean)) {
        return {
            valid: false,
            error: 'Minecraft UUID yalnızca geçerli onaltılık (hexadecimal 0-9, a-f) karakterler içerebilir.'
        };
    }
    return { valid: true };
}

/**
 * Validates a Minecraft username (3-16 alphanumeric or underscore).
 */
export function validateMinecraftUsername(username: string): { valid: boolean; error?: string } {
    if (!username || !username.trim()) {
        return { valid: false, error: 'Minecraft oyuncu adı zorunludur.' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 16) {
        return {
            valid: false,
            error: 'Minecraft oyuncu adı 3 ile 16 karakter arasında olmalıdır.'
        };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return {
            valid: false,
            error: 'Minecraft oyuncu adı yalnızca harf, rakam ve alt çizgi (_) içerebilir.'
        };
    }
    return { valid: true };
}

/**
 * Helper to convert Firestore timestamp or ISO string to Date safely.
 */
export function parseDate(val: unknown): Date {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
        return (val as { toDate: () => Date }).toDate();
    }
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') return new Date(val);
    return new Date();
}

/**
 * Adds a Minecraft player to a YouTuber.
 * Ensures:
 * - UUID canonicalization
 * - Global player lookup or creation
 * - No duplicate player association for the same YouTuber
 * - Only one primary player per YouTuber (demotes existing primary in transaction/batch)
 */
export async function addPlayerToYoutuber(input: AddPlayerInput): Promise<EnrichedYoutuberPlayer> {
    const usernameValidation = validateMinecraftUsername(input.username);
    if (!usernameValidation.valid) {
        throw new Error(usernameValidation.error);
    }

    const uuidValidation = validateMinecraftUuid(input.uuid);
    if (!uuidValidation.valid) {
        throw new Error(uuidValidation.error);
    }

    const trimmedUsername = input.username.trim();
    const canonicalUuid = normalizeUuid(input.uuid);
    const now = new Date();

    // 1. Find or create global MinecraftPlayer
    let playerId: string;
    let existingPlayer: MinecraftPlayer | null = null;

    const qPlayer = query(
        collection(db, 'minecraft_players'),
        where('uuid', '==', canonicalUuid)
    );
    const playerSnapshot = await getDocs(qPlayer);

    if (!playerSnapshot.empty) {
        const pDoc = playerSnapshot.docs[0];
        playerId = pDoc.id;
        const pData = pDoc.data();
        existingPlayer = {
            id: playerId,
            username: pData.username,
            uuid: pData.uuid,
            createdAt: parseDate(pData.createdAt),
            updatedAt: parseDate(pData.updatedAt)
        };

        // Update username if it changed
        if (pData.username !== trimmedUsername) {
            await updateDoc(doc(db, 'minecraft_players', playerId), {
                username: trimmedUsername,
                updatedAt: Timestamp.fromDate(now)
            });
            existingPlayer.username = trimmedUsername;
            existingPlayer.updatedAt = now;
        }
    } else {
        const newPlayerDoc = await addDoc(collection(db, 'minecraft_players'), {
            username: trimmedUsername,
            uuid: canonicalUuid,
            createdAt: Timestamp.fromDate(now),
            updatedAt: Timestamp.fromDate(now)
        });
        playerId = newPlayerDoc.id;
        existingPlayer = {
            id: playerId,
            username: trimmedUsername,
            uuid: canonicalUuid,
            createdAt: now,
            updatedAt: now
        };
    }

    // 2. Check if already associated with this YouTuber
    const qDuplicate = query(
        collection(db, 'youtuber_minecraft_players'),
        where('userId', '==', input.userId),
        where('youtuberId', '==', input.youtuberId),
        where('minecraftPlayerId', '==', playerId)
    );
    const duplicateSnapshot = await getDocs(qDuplicate);
    if (!duplicateSnapshot.empty) {
        throw new Error('Bu Minecraft oyuncusu zaten bu YouTuber’a bağlı.');
    }

    // 3. Handle primary player constraint
    const isPrimary = input.isPrimary ?? (input.relationshipType === 'owner');

    if (isPrimary) {
        const qPrimary = query(
            collection(db, 'youtuber_minecraft_players'),
            where('userId', '==', input.userId),
            where('youtuberId', '==', input.youtuberId),
            where('isPrimary', '==', true)
        );
        const primarySnapshot = await getDocs(qPrimary);
        for (const pDoc of primarySnapshot.docs) {
            await updateDoc(doc(db, 'youtuber_minecraft_players', pDoc.id), {
                isPrimary: false,
                updatedAt: Timestamp.fromDate(now)
            });
        }
    }

    // 4. Create association
    const newAssocDoc = await addDoc(collection(db, 'youtuber_minecraft_players'), {
        youtuberId: input.youtuberId,
        minecraftPlayerId: playerId,
        relationshipType: input.relationshipType,
        isPrimary,
        isActive: input.isActive ?? true,
        note: input.note ? input.note.trim() : null,
        userId: input.userId,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now)
    });

    return {
        associationId: newAssocDoc.id,
        youtuberId: input.youtuberId,
        relationshipType: input.relationshipType,
        isPrimary,
        isActive: input.isActive ?? true,
        note: input.note ? input.note.trim() : undefined,
        createdAt: now,
        updatedAt: now,
        player: existingPlayer
    };
}

/**
 * Updates an existing YouTuber player association and player details.
 */
export async function updateYoutuberPlayer(input: UpdatePlayerInput): Promise<EnrichedYoutuberPlayer> {
    const usernameValidation = validateMinecraftUsername(input.username);
    if (!usernameValidation.valid) {
        throw new Error(usernameValidation.error);
    }

    const uuidValidation = validateMinecraftUuid(input.uuid);
    if (!uuidValidation.valid) {
        throw new Error(uuidValidation.error);
    }

    const trimmedUsername = input.username.trim();
    const canonicalUuid = normalizeUuid(input.uuid);
    const now = new Date();

    const assocRef = doc(db, 'youtuber_minecraft_players', input.associationId);
    const assocSnap = await getDoc(assocRef);
    if (!assocSnap.exists()) {
        throw new Error('Oyuncu ilişkisi bulunamadı.');
    }

    const assocData = assocSnap.data();
    if (assocData.youtuberId !== input.youtuberId) {
        throw new Error('Oyuncu bu YouTuber ile ilişkili değil.');
    }

    // Check UUID resolution
    let targetPlayerId = assocData.minecraftPlayerId;
    const currentTargetDoc = await getDoc(doc(db, 'minecraft_players', targetPlayerId));
    const currentTargetData = currentTargetDoc.exists() ? currentTargetDoc.data() : null;

    if (!currentTargetData || currentTargetData.uuid !== canonicalUuid) {
        // UUID changed: look for existing player or create new one
        const qOtherPlayer = query(
            collection(db, 'minecraft_players'),
            where('uuid', '==', canonicalUuid)
        );
        const otherPlayerSnap = await getDocs(qOtherPlayer);
        if (!otherPlayerSnap.empty) {
            targetPlayerId = otherPlayerSnap.docs[0].id;
        } else {
            const newPlayerDoc = await addDoc(collection(db, 'minecraft_players'), {
                username: trimmedUsername,
                uuid: canonicalUuid,
                createdAt: Timestamp.fromDate(now),
                updatedAt: Timestamp.fromDate(now)
            });
            targetPlayerId = newPlayerDoc.id;
        }

        // Check duplicate constraint if targetPlayerId changed
        if (targetPlayerId !== assocData.minecraftPlayerId) {
            const qDup = query(
                collection(db, 'youtuber_minecraft_players'),
                where('userId', '==', input.userId),
                where('youtuberId', '==', input.youtuberId),
                where('minecraftPlayerId', '==', targetPlayerId)
            );
            const dupSnap = await getDocs(qDup);
            if (!dupSnap.empty && dupSnap.docs.some(d => d.id !== input.associationId)) {
                throw new Error('Bu Minecraft oyuncusu zaten bu YouTuber’a bağlı.');
            }
        }
    }

    // Always update username on the global player record
    await updateDoc(doc(db, 'minecraft_players', targetPlayerId), {
        username: trimmedUsername,
        updatedAt: Timestamp.fromDate(now)
    });

    // Handle isPrimary demotion if this one is set to primary
    if (input.isPrimary) {
        const qPrimary = query(
            collection(db, 'youtuber_minecraft_players'),
            where('userId', '==', input.userId),
            where('youtuberId', '==', input.youtuberId),
            where('isPrimary', '==', true)
        );
        const primarySnapshot = await getDocs(qPrimary);
        for (const pDoc of primarySnapshot.docs) {
            if (pDoc.id !== input.associationId) {
                await updateDoc(doc(db, 'youtuber_minecraft_players', pDoc.id), {
                    isPrimary: false,
                    updatedAt: Timestamp.fromDate(now)
                });
            }
        }
    }

    // Update association record
    await updateDoc(assocRef, {
        minecraftPlayerId: targetPlayerId,
        relationshipType: input.relationshipType,
        isPrimary: input.isPrimary,
        isActive: input.isActive,
        note: input.note ? input.note.trim() : null,
        updatedAt: Timestamp.fromDate(now)
    });

    return {
        associationId: input.associationId,
        youtuberId: input.youtuberId,
        relationshipType: input.relationshipType,
        isPrimary: input.isPrimary,
        isActive: input.isActive,
        note: input.note ? input.note.trim() : undefined,
        createdAt: parseDate(assocData.createdAt),
        updatedAt: now,
        player: {
            id: targetPlayerId,
            username: trimmedUsername,
            uuid: canonicalUuid,
            createdAt: currentTargetData ? parseDate(currentTargetData.createdAt) : now,
            updatedAt: now
        }
    };
}

/**
 * Removes the association between a YouTuber and a Minecraft player.
 * Does NOT delete the global MinecraftPlayer record.
 */
export async function deleteYoutuberPlayerAssociation(associationId: string, youtuberId: string): Promise<void> {
    const assocRef = doc(db, 'youtuber_minecraft_players', associationId);
    const assocSnap = await getDoc(assocRef);
    if (!assocSnap.exists()) {
        throw new Error('Oyuncu ilişkisi bulunamadı.');
    }

    const assocData = assocSnap.data();
    if (assocData.youtuberId !== youtuberId) {
        throw new Error('İlişki belirtilen YouTuber’a ait değil.');
    }

    await deleteDoc(assocRef);
}

/**
 * Subscribes to players for a specific YouTuber with real-time updates.
 */
export function subscribeYoutuberPlayers(
    youtuberId: string,
    userId: string,
    onData: (players: EnrichedYoutuberPlayer[]) => void,
    onError?: (err: Error) => void
): Unsubscribe {
    const qAssoc = query(
        collection(db, 'youtuber_minecraft_players'),
        where('youtuberId', '==', youtuberId),
        where('userId', '==', userId)
    );

    return onSnapshot(
        qAssoc,
        async (snapshot) => {
            try {
                if (snapshot.empty) {
                    onData([]);
                    return;
                }

                const playerMap = new Map<string, MinecraftPlayer>();
                const playerIdsToFetch: string[] = [];

                snapshot.docs.forEach((d) => {
                    const pid = d.data().minecraftPlayerId;
                    if (pid && !playerIdsToFetch.includes(pid)) {
                        playerIdsToFetch.push(pid);
                    }
                });

                // Fetch player details
                await Promise.all(
                    playerIdsToFetch.map(async (pid) => {
                        try {
                            const pSnap = await getDoc(doc(db, 'minecraft_players', pid));
                            if (pSnap.exists()) {
                                const pData = pSnap.data();
                                playerMap.set(pid, {
                                    id: pSnap.id,
                                    username: pData.username || 'Bilinmeyen',
                                    uuid: pData.uuid || '',
                                    createdAt: parseDate(pData.createdAt),
                                    updatedAt: parseDate(pData.updatedAt)
                                });
                            }
                        } catch (e) {
                            console.error(`Error loading player ${pid}:`, e);
                        }
                    })
                );

                const enriched: EnrichedYoutuberPlayer[] = [];
                snapshot.docs.forEach((d) => {
                    const data = d.data();
                    const player = playerMap.get(data.minecraftPlayerId);
                    if (player) {
                        enriched.push({
                            associationId: d.id,
                            youtuberId: data.youtuberId,
                            relationshipType: data.relationshipType || 'other',
                            isPrimary: !!data.isPrimary,
                            isActive: data.isActive !== false,
                            note: data.note || undefined,
                            createdAt: parseDate(data.createdAt),
                            updatedAt: parseDate(data.updatedAt),
                            player
                        });
                    }
                });

                // Sort: 1) Primary, 2) Active, 3) Passive, 4) Player name
                enriched.sort((a, b) => {
                    if (a.isPrimary !== b.isPrimary) {
                        return a.isPrimary ? -1 : 1;
                    }
                    if (a.isActive !== b.isActive) {
                        return a.isActive ? -1 : 1;
                    }
                    return a.player.username.localeCompare(b.player.username, 'tr', { sensitivity: 'base' });
                });

                onData(enriched);
            } catch (err) {
                if (onError) onError(err as Error);
            }
        },
        (err) => {
            if (onError) onError(err);
        }
    );
}

/**
 * Future GitHub Mod Access & Allowlist Service.
 * Central function to retrieve all active canonical Minecraft UUIDs for a YouTuber.
 * - Only isActive = true players
 * - Canonical format
 * - Unique (no duplicate UUIDs)
 * - Decoupled from UI components
 */
export async function getActiveMinecraftPlayersForYoutuber(
    youtuberId: string
): Promise<{ uuid: string; username: string; relationshipType: RelationshipType; isPrimary: boolean }[]> {
    if (!youtuberId) return [];

    const qAssoc = query(
        collection(db, 'youtuber_minecraft_players'),
        where('youtuberId', '==', youtuberId),
        where('isActive', '==', true)
    );

    const assocSnap = await getDocs(qAssoc);
    if (assocSnap.empty) return [];

    const results: { uuid: string; username: string; relationshipType: RelationshipType; isPrimary: boolean }[] = [];
    const seenUuids = new Set<string>();

    for (const d of assocSnap.docs) {
        const data = d.data();
        const pSnap = await getDoc(doc(db, 'minecraft_players', data.minecraftPlayerId));
        if (pSnap.exists()) {
            const pData = pSnap.data();
            const canonical = normalizeUuid(pData.uuid);
            if (canonical && !seenUuids.has(canonical)) {
                seenUuids.add(canonical);
                results.push({
                    uuid: canonical,
                    username: pData.username || 'Bilinmeyen',
                    relationshipType: data.relationshipType || 'other',
                    isPrimary: !!data.isPrimary
                });
            }
        }
    }

    return results;
}
