import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { ModProject } from '@/lib/mods/types';
import { getRepositoryFile, updateRepositoryFile } from '@/lib/github/client';
import { parseLegacyReadme, renderManagedReadme, RenderInputGroup, UUID_REGEX } from '@/lib/github/readme-parser';
import { buildDesiredUuidState } from '@/lib/mods/mod-service';
import { logAudit } from '@/lib/audit-log';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const auth = await requireOwnerUser(request);
        if (!auth.ok) {
            return auth.response;
        }
        const userId = auth.user.userId;

        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists) {
            return NextResponse.json({ error: 'Mod projesi bulunamadı.' }, { status: 404 });
        }
        const mod = { id: modSnap.id, ...modSnap.data() } as ModProject;

        let body: Record<string, unknown> = {};
        try {
            body = await request.json();
        } catch {
            // body is optional, defaults to preview: true
        }

        const isPreview = body.preview !== false; // default true for safety!
        const manualProtectedInput: string[] = Array.isArray(body.manualProtectedUuids)
            ? body.manualProtectedUuids.map((u: unknown) => String(u).toLowerCase().trim())
            : [];

        // 1. Fetch current README from GitHub
        const gitFile = await getRepositoryFile(mod);
        const parsed = parseLegacyReadme(gitFile.content);

        if (parsed.hasMalformedMarkers) {
            return NextResponse.json({
                error: `Bozuk marker yapısı tespit edildi: ${parsed.malformedReason || 'Bilinmeyen hata'}`
            }, { status: 400 });
        }

        if (parsed.legacyUuids.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'Yönetilmeyen bölümde (legacy) taşınacak UUID kaydı bulunamadı.',
                legacyUuids: []
            });
        }

        const uniqueLegacyUuids = Array.from(new Set(parsed.legacyUuids.map((u) => u.toLowerCase())));

        // 2. Classify legacy UUIDs: determine bindings
        // A UUID can bind to:
        // - Existing YouTuber Minecraft player
        // - Global Minecraft player
        // - Manually protected managed entry
        const boundUuids = new Set<string>();
        const orphanUuids: string[] = [];
        const bindingDetails: Record<string, { type: 'YOUTUBER_PLAYER' | 'GLOBAL_PLAYER' | 'MANUAL_PROTECTED'; name?: string }> = {};

        // Existing manual protected on mod
        const existingManualProtected = new Set<string>(
            (mod.manualProtectedUuids || []).map((u) => u.toLowerCase().trim())
        );

        for (const uuid of uniqueLegacyUuids) {
            // Check manual protection
            if (existingManualProtected.has(uuid) || manualProtectedInput.includes(uuid)) {
                boundUuids.add(uuid);
                bindingDetails[uuid] = { type: 'MANUAL_PROTECTED', name: 'Manuel Korunan Kayıt' };
                continue;
            }

            // Check Minecraft player records
            const playerSnap = await adminDb
                .collection('minecraft_players')
                .where('uuid', '==', uuid)
                .get();

            if (!playerSnap.empty) {
                const playerDoc = playerSnap.docs[0];
                const playerData = playerDoc.data();

                if (playerData.isGlobal) {
                    boundUuids.add(uuid);
                    bindingDetails[uuid] = { type: 'GLOBAL_PLAYER', name: playerData.username || 'Global Oyuncu' };
                    continue;
                }

                // Check YouTuber association
                const assocSnap = await adminDb
                    .collection('youtuber_minecraft_players')
                    .where('minecraftPlayerId', '==', playerDoc.id)
                    .get();

                if (!assocSnap.empty) {
                    const assocData = assocSnap.docs[0].data();
                    const youtuberSnap = await adminDb.collection('youtubers').doc(assocData.youtuberId).get();
                    const youtuberName = youtuberSnap.exists ? youtuberSnap.data()?.name : 'YouTuber Oyuncusu';

                    boundUuids.add(uuid);
                    bindingDetails[uuid] = { type: 'YOUTUBER_PLAYER', name: youtuberName };
                    continue;
                }
            }

            // No matching binding found -> Orphan UUID
            orphanUuids.push(uuid);
        }

        // 3. Filter ONLY bound UUID lines from preManaged and postManaged content.
        // Orphan UUIDs are STRICTLY PRESERVED in the unmanaged section so they are never accidentally deleted!
        const filterBoundLines = (text: string): { cleaned: string; removedLines: string[] } => {
            const removed: string[] = [];
            const lines = text.split(/\r?\n/);
            const remaining = lines.filter((line) => {
                const trimmed = line.trim();
                const match = trimmed.match(UUID_REGEX);
                if (match) {
                    const matchedUuid = match[0].toLowerCase();
                    if (boundUuids.has(matchedUuid)) {
                        removed.push(trimmed);
                        return false; // Remove bound line to migrate to managed
                    }
                    // Orphan UUID: keep in unmanaged content!
                    return true;
                }
                return true;
            });
            return { cleaned: remaining.join(parsed.lineEnding), removedLines: removed };
        };

        const preCleaned = filterBoundLines(parsed.preManagedContent);
        const postCleaned = filterBoundLines(parsed.postManagedContent);

        // Reconstitute clean base with orphan UUIDs retained and bound UUIDs removed
        let cleanBase = '';
        if (parsed.isManagedSectionPresent) {
            cleanBase = `${preCleaned.cleaned}\n${gitFile.content.slice(
                gitFile.content.indexOf('<!-- BLUMECORE-MANAGED-START -->'),
                gitFile.content.indexOf('<!-- BLUMECORE-MANAGED-END -->') + '<!-- BLUMECORE-MANAGED-END -->'.length
            )}\n${postCleaned.cleaned}`;
        } else {
            cleanBase = preCleaned.cleaned;
        }

        // 4. Build desired state
        // For newly designated manual protected UUIDs, ensure they are registered in the state
        const updatedManualProtected = Array.from(
            new Set([...existingManualProtected, ...manualProtectedInput.filter((u) => boundUuids.has(u))])
        );

        const desiredState = await buildDesiredUuidState(mod.id, mod.userId);
        const desiredGroups: RenderInputGroup[] = desiredState.youtuberGroups.map((g) => ({
            youtuberId: g.youtuberId,
            youtuberName: g.youtuberName,
            uuids: g.players.map((p) => p.uuid)
        }));

        // Add newly bound manual protected entries if not already in desiredGroups
        const existingRenderedUuids = new Set(desiredGroups.flatMap((g) => g.uuids.map((u) => u.toLowerCase())));
        const missingBoundUuids = Array.from(boundUuids).filter((u) => !existingRenderedUuids.has(u));

        if (missingBoundUuids.length > 0) {
            desiredGroups.push({
                youtuberId: '__manual_protected__',
                youtuberName: 'Manuel Korunan Oyuncular',
                uuids: missingBoundUuids
            });
        }

        const renderResult = renderManagedReadme(cleanBase, desiredGroups);
        const allRemovedLines = [...preCleaned.removedLines, ...postCleaned.removedLines];

        if (isPreview) {
            return NextResponse.json({
                preview: true,
                totalLegacyUuidCount: uniqueLegacyUuids.length,
                migratedCount: boundUuids.size,
                migratedUuids: Array.from(boundUuids),
                orphanCount: orphanUuids.length,
                orphanUuids,
                bindingDetails,
                removedLines: allRemovedLines,
                proposedContent: renderResult.content,
                message: `${boundUuids.size} adet doğrulanmış UUID yönetilen alana taşınmak üzere hazırlandı. Sistemde karşılığı olmayan ${orphanUuids.length} adet sahipsiz UUID silinmemesi için yönetilmeyen bölümde korundu.`
            });
        }

        // 5. Apply migration
        // If new manual protected entries were specified, persist them to Firestore so future syncs preserve them!
        const now = Date.now();
        const modUpdateData: Record<string, unknown> = {
            lastSuccessfulSyncAt: now,
            updatedAt: now
        };

        if (updatedManualProtected.length > 0) {
            modUpdateData.manualProtectedUuids = updatedManualProtected;
        }

        // Commit to GitHub
        const commitMessage = `BlumeCore: safely migrate ${boundUuids.size} verified UUIDs to managed section for ${mod.modKey}`;
        const updateRes = await updateRepositoryFile(
            mod,
            renderResult.content,
            gitFile.sha,
            0,
            commitMessage
        );

        modUpdateData.lastSuccessfulCommitSha = updateRes.commitSha;
        modUpdateData.syncStatus = 'SUCCESS';

        await adminDb.collection('mod_projects').doc(mod.id).update(modUpdateData);

        await logAudit({
            eventType: 'PLAYER_UPDATED',
            actorUserId: userId,
            timestamp: now,
            modId: mod.modKey,
            owner: mod.githubOwner,
            details: {
                migratedBoundCount: boundUuids.size,
                preservedOrphanCount: orphanUuids.length,
                commitSha: updateRes.commitSha
            }
        });

        return NextResponse.json({
            success: true,
            migratedCount: boundUuids.size,
            orphanCount: orphanUuids.length,
            orphanUuids,
            commitSha: updateRes.commitSha,
            message: `${boundUuids.size} adet doğrulanmış UUID başarıyla yönetilen alana taşındı. Sistemde karşılığı olmayan ${orphanUuids.length} adet sahipsiz UUID yönetilmeyen bölümde korundu.`
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/[modId]/legacy-migration:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Legacy UUID taşıma işlemi sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
