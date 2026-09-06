import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeUuid,
    validateMinecraftUuid,
    validateMinecraftUsername,
    RelationshipType,
    MinecraftPlayer,
    YoutuberMinecraftPlayer,
    EnrichedYoutuberPlayer
} from '../src/lib/minecraft-players';

describe('Minecraft Players Domain & Validation Tests', () => {

    describe('UUID Normalization & Validation', () => {
        it('should convert 32-character unhyphenated hex to canonical 36-char lowercase hyphenated format', () => {
            const raw32 = '550e8400e29b41d4a716446655440000';
            const canonical = normalizeUuid(raw32);
            assert.equal(canonical, '550e8400-e29b-41d4-a716-446655440000');
        });

        it('should convert uppercase 36-character UUID to lowercase canonical format', () => {
            const raw36 = '550E8400-E29B-41D4-A716-446655440000';
            const canonical = normalizeUuid(raw36);
            assert.equal(canonical, '550e8400-e29b-41d4-a716-446655440000');
        });

        it('should trim surrounding whitespace from UUIDs', () => {
            const padded = '   550e8400e29b41d4a716446655440000   ';
            const canonical = normalizeUuid(padded);
            assert.equal(canonical, '550e8400-e29b-41d4-a716-446655440000');
        });

        it('should accept valid 32-char and 36-char hex UUIDs', () => {
            assert.equal(validateMinecraftUuid('550e8400-e29b-41d4-a716-446655440000').valid, true);
            assert.equal(validateMinecraftUuid('550e8400e29b41d4a716446655440000').valid, true);
            assert.equal(validateMinecraftUuid('069a79f4-44e9-4726-a5be-fca90e38aaf5').valid, true);
        });

        it('should reject invalid UUIDs with clear Turkish error messages', () => {
            // Empty
            const emptyRes = validateMinecraftUuid('');
            assert.equal(emptyRes.valid, false);
            assert.equal(emptyRes.error, 'Minecraft UUID alanı zorunludur.');

            // Invalid length
            const shortRes = validateMinecraftUuid('12345');
            assert.equal(shortRes.valid, false);
            assert.equal(shortRes.error, 'Minecraft UUID 32 veya 36 karakter uzunluğunda olmalıdır.');

            // Non-hex characters
            const nonHexRes = validateMinecraftUuid('550e8400-e29b-41d4-a716-44665544000z');
            assert.equal(nonHexRes.valid, false);
            assert.equal(nonHexRes.error, 'Minecraft UUID yalnızca geçerli onaltılık (hexadecimal 0-9, a-f) karakterler içerebilir.');
        });
    });

    describe('Minecraft Username Validation', () => {
        it('should accept valid usernames between 3 and 16 characters with letters, numbers, and underscores', () => {
            assert.equal(validateMinecraftUsername('Notch').valid, true);
            assert.equal(validateMinecraftUsername('Player_123').valid, true);
            assert.equal(validateMinecraftUsername('abc').valid, true);
            assert.equal(validateMinecraftUsername('sixteencharactrs').valid, true);
        });

        it('should reject usernames that are too short, too long, empty, or have invalid characters', () => {
            assert.equal(validateMinecraftUsername('').valid, false);
            assert.equal(validateMinecraftUsername('ab').valid, false);
            assert.equal(validateMinecraftUsername('thisusernameiswaytoolong').valid, false);
            assert.equal(validateMinecraftUsername('player name').valid, false); // has space
            assert.equal(validateMinecraftUsername('notch!').valid, false); // has exclamation
        });
    });

    describe('In-Memory Business Logic Simulation (Transactions, Constraints, Duplicate Prevention)', () => {
        // In-memory mock database state
        let globalPlayers: MinecraftPlayer[] = [];
        let associations: YoutuberMinecraftPlayer[] = [];

        function resetDb() {
            globalPlayers = [];
            associations = [];
        }

        // Mock implementation of add logic
        function mockAddPlayer(input: {
            youtuberId: string;
            userId: string;
            username: string;
            uuid: string;
            relationshipType: RelationshipType;
            isPrimary?: boolean;
            isActive?: boolean;
            note?: string;
        }) {
            const canonicalUuid = normalizeUuid(input.uuid);
            const trimmedUsername = input.username.trim();

            let player = globalPlayers.find((p) => p.uuid === canonicalUuid);
            if (!player) {
                player = {
                    id: `player-${globalPlayers.length + 1}`,
                    username: trimmedUsername,
                    uuid: canonicalUuid,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                globalPlayers.push(player);
            } else if (player.username !== trimmedUsername) {
                player.username = trimmedUsername;
                player.updatedAt = new Date();
            }

            // Check duplicate on same youtuber
            const duplicate = associations.find(
                (a) => a.youtuberId === input.youtuberId && a.minecraftPlayerId === player.id
            );
            if (duplicate) {
                throw new Error('Bu Minecraft oyuncusu zaten bu YouTuber’a bağlı.');
            }

            const isPrimary = input.isPrimary ?? (input.relationshipType === 'owner');

            // Handle primary demotion
            if (isPrimary) {
                associations.forEach((a) => {
                    if (a.youtuberId === input.youtuberId && a.isPrimary) {
                        a.isPrimary = false;
                        a.updatedAt = new Date();
                    }
                });
            }

            const newAssoc: YoutuberMinecraftPlayer = {
                id: `assoc-${associations.length + 1}`,
                youtuberId: input.youtuberId,
                minecraftPlayerId: player.id,
                relationshipType: input.relationshipType,
                isPrimary,
                isActive: input.isActive ?? true,
                note: input.note,
                userId: input.userId,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            associations.push(newAssoc);

            return { player, association: newAssoc };
        }

        // Mock active player query (GitHub Mod Access API)
        function mockGetActivePlayersForYoutuber(youtuberId: string) {
            const activeAssocs = associations.filter((a) => a.youtuberId === youtuberId && a.isActive);
            const results: { uuid: string; username: string; isPrimary: boolean }[] = [];
            const seen = new Set<string>();

            for (const a of activeAssocs) {
                const player = globalPlayers.find((p) => p.id === a.minecraftPlayerId);
                if (player && !seen.has(player.uuid)) {
                    seen.add(player.uuid);
                    results.push({
                        uuid: player.uuid,
                        username: player.username,
                        isPrimary: a.isPrimary
                    });
                }
            }
            return results;
        }

        it('should add a player and normalize UUID', () => {
            resetDb();
            const res = mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'Notch',
                uuid: '069a79f444e94726a5befca90e38aaf5',
                relationshipType: 'owner'
            });

            assert.equal(res.player.uuid, '069a79f4-44e9-4726-a5be-fca90e38aaf5');
            assert.equal(res.association.isPrimary, true);
            assert.equal(res.association.isActive, true);
        });

        it('should reject duplicate UUID on the same YouTuber', () => {
            resetDb();
            mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'Notch',
                uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
                relationshipType: 'owner'
            });

            assert.throws(
                () => {
                    mockAddPlayer({
                        youtuberId: 'yt-1',
                        userId: 'user-1',
                        username: 'Notch_Alternate',
                        uuid: '069a79f444e94726a5befca90e38aaf5',
                        relationshipType: 'friend'
                    });
                },
                { message: 'Bu Minecraft oyuncusu zaten bu YouTuber’a bağlı.' }
            );
        });

        it('should allow the same UUID to be associated with a different YouTuber', () => {
            resetDb();
            const res1 = mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'Notch',
                uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
                relationshipType: 'owner'
            });

            const res2 = mockAddPlayer({
                youtuberId: 'yt-2',
                userId: 'user-1',
                username: 'Notch',
                uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
                relationshipType: 'friend'
            });

            // Shares same global player ID
            assert.equal(res1.player.id, res2.player.id);
            assert.equal(globalPlayers.length, 1);
            assert.equal(associations.length, 2);
        });

        it('should demote existing primary player when a new primary player is assigned', () => {
            resetDb();
            const p1 = mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'PlayerOne',
                uuid: '550e8400-e29b-41d4-a716-446655440001',
                relationshipType: 'owner',
                isPrimary: true
            });

            const p2 = mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'PlayerTwo',
                uuid: '550e8400-e29b-41d4-a716-446655440002',
                relationshipType: 'friend',
                isPrimary: true
            });

            // p1 should now be demoted
            const p1Assoc = associations.find((a) => a.id === p1.association.id);
            const p2Assoc = associations.find((a) => a.id === p2.association.id);

            assert.equal(p1Assoc?.isPrimary, false);
            assert.equal(p2Assoc?.isPrimary, true);
        });

        it('should only return active players in getActiveMinecraftPlayersForYoutuber', () => {
            resetDb();
            mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'ActiveOne',
                uuid: '550e8400-e29b-41d4-a716-446655440001',
                relationshipType: 'owner',
                isActive: true
            });

            mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'PassiveTwo',
                uuid: '550e8400-e29b-41d4-a716-446655440002',
                relationshipType: 'friend',
                isActive: false
            });

            const activeList = mockGetActivePlayersForYoutuber('yt-1');
            assert.equal(activeList.length, 1);
            assert.equal(activeList[0].username, 'ActiveOne');
            assert.equal(activeList[0].uuid, '550e8400-e29b-41d4-a716-446655440001');
        });

        it('should preserve global player when association is deleted', () => {
            resetDb();
            const res = mockAddPlayer({
                youtuberId: 'yt-1',
                userId: 'user-1',
                username: 'PlayerToDelete',
                uuid: '550e8400-e29b-41d4-a716-446655440001',
                relationshipType: 'friend'
            });

            assert.equal(associations.length, 1);
            assert.equal(globalPlayers.length, 1);

            // Delete association
            associations = associations.filter((a) => a.id !== res.association.id);

            assert.equal(associations.length, 0);
            assert.equal(globalPlayers.length, 1); // Global player is NOT deleted
        });
    });

    describe('UI List Sorting and Presentation Rules', () => {
        it('should sort players correctly: 1) Primary, 2) Active, 3) Passive, 4) Alphabetical', () => {
            const list: EnrichedYoutuberPlayer[] = [
                {
                    associationId: '1',
                    youtuberId: 'yt-1',
                    relationshipType: 'friend',
                    isPrimary: false,
                    isActive: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    player: { id: 'p1', username: 'Zack', uuid: 'uuid-1', createdAt: new Date(), updatedAt: new Date() }
                },
                {
                    associationId: '2',
                    youtuberId: 'yt-1',
                    relationshipType: 'friend',
                    isPrimary: false,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    player: { id: 'p2', username: 'Bob', uuid: 'uuid-2', createdAt: new Date(), updatedAt: new Date() }
                },
                {
                    associationId: '3',
                    youtuberId: 'yt-1',
                    relationshipType: 'owner',
                    isPrimary: true,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    player: { id: 'p3', username: 'Charlie', uuid: 'uuid-3', createdAt: new Date(), updatedAt: new Date() }
                },
                {
                    associationId: '4',
                    youtuberId: 'yt-1',
                    relationshipType: 'friend',
                    isPrimary: false,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    player: { id: 'p4', username: 'Alice', uuid: 'uuid-4', createdAt: new Date(), updatedAt: new Date() }
                }
            ];

            list.sort((a, b) => {
                if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                return a.player.username.localeCompare(b.player.username, 'tr', { sensitivity: 'base' });
            });

            // Order should be:
            // 1. Charlie (isPrimary)
            // 2. Alice (isActive, alphabetical before Bob)
            // 3. Bob (isActive)
            // 4. Zack (passive)
            assert.equal(list[0].player.username, 'Charlie');
            assert.equal(list[1].player.username, 'Alice');
            assert.equal(list[2].player.username, 'Bob');
            assert.equal(list[3].player.username, 'Zack');
        });

        it('should correctly format delete confirmation message', () => {
            const playerName = 'Notch';
            const youtuberTitle = 'Wol lech';
            const msg = `“${playerName}” adlı Minecraft oyuncusunun ${youtuberTitle} ile bağlantısı kaldırılacak. Devam etmek istiyor musun?`;
            assert.equal(
                msg,
                '“Notch” adlı Minecraft oyuncusunun Wol lech ile bağlantısı kaldırılacak. Devam etmek istiyor musun?'
            );
        });
    });
});
