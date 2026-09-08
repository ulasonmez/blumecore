import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { YoutuberModAccess, YoutuberAccessSummary } from '@/lib/mods/types';
import {
    createOrCoalesceSyncJob,
    processSyncJob,
    getActiveMinecraftPlayersForYoutuberAdmin
} from '@/lib/mods/mod-service';
import { requireOwnerUser } from '@/lib/server-auth';

export async function GET(
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

        // Verify mod ownership
        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists || modSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Mod bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        const accessSnap = await adminDb
            .collection('youtuber_mod_access')
            .where('modProjectId', '==', modId)
            .where('userId', '==', userId)
            .get();

        const summaries: YoutuberAccessSummary[] = [];

        for (const aDoc of accessSnap.docs) {
            const access = { id: aDoc.id, ...(aDoc.data() as Omit<YoutuberModAccess, 'id'>) };

            const ySnap = await adminDb.collection('youtubers').doc(access.youtuberId).get();
            const youtuberName = ySnap.exists ? ySnap.data()?.name || 'Bilinmeyen' : 'Bilinmeyen';

            const activePlayers = await getActiveMinecraftPlayersForYoutuberAdmin(access.youtuberId);

            summaries.push({
                access,
                youtuberName,
                activePlayerCount: activePlayers.length,
                players: activePlayers
            });
        }

        return NextResponse.json({ data: summaries });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods/[modId]/access:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Yetki listesi alınırken sunucu hatası oluştu.' }, { status: 500 });
    }
}

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

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
        }

        const { youtuberId, action, revokeReason } = body;

        if (!youtuberId || typeof youtuberId !== 'string' || !action || typeof action !== 'string') {
            return NextResponse.json({ error: 'YouTuber ID ve işlem türü gereklidir.' }, { status: 400 });
        }

        // Verify mod ownership
        const modSnap = await adminDb.collection('mod_projects').doc(modId).get();
        if (!modSnap.exists || modSnap.data()?.userId !== userId) {
            return NextResponse.json({ error: 'Mod bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        // Check existing access
        const accessSnap = await adminDb
            .collection('youtuber_mod_access')
            .where('modProjectId', '==', modId)
            .where('youtuberId', '==', youtuberId)
            .where('userId', '==', userId)
            .get();
        const existingDoc = !accessSnap.empty ? accessSnap.docs[0] : null;

        const now = Date.now();
        let accessId: string;
        let eventType: 'MANUAL_GRANTED' | 'MANUAL_REVOKED' | 'MANUAL_REGRANTED';
        let triggerType: 'MANUAL_ACCESS_GRANTED' | 'MANUAL_ACCESS_REVOKED';

        if (action === 'grant' || action === 'regrant') {
            triggerType = 'MANUAL_ACCESS_GRANTED';
            eventType = action === 'regrant' ? 'MANUAL_REGRANTED' : 'MANUAL_GRANTED';

            if (existingDoc) {
                accessId = existingDoc.id;
                const existingSources = (existingDoc.data()?.grantSources as any[]) || [];
                const updatedSources = existingSources.filter(s => s.type !== 'MANUAL');
                updatedSources.push({ type: 'MANUAL', addedAt: now });

                await adminDb.collection('youtuber_mod_access').doc(accessId).update({
                    status: 'ACTIVE',
                    syncStatus: 'PENDING',
                    manualDecision: 'FORCE_ALLOW',
                    grantSources: updatedSources,
                    revokedAt: null,
                    revokedByUserId: null,
                    revokeReason: null,
                    updatedAt: now
                });
            } else {
                const newAccess: Omit<YoutuberModAccess, 'id'> = {
                    youtuberId,
                    modProjectId: modId,
                    status: 'ACTIVE',
                    syncStatus: 'PENDING',
                    grantType: 'MANUAL',
                    grantSources: [{ type: 'MANUAL', addedAt: now }],
                    manualDecision: 'FORCE_ALLOW',
                    grantedAt: now,
                    grantedByUserId: userId,
                    userId,
                    createdAt: now,
                    updatedAt: now
                };
                const ref = await adminDb.collection('youtuber_mod_access').add(newAccess);
                accessId = ref.id;
            }
        } else if (action === 'revoke') {
            triggerType = 'MANUAL_ACCESS_REVOKED';
            eventType = 'MANUAL_REVOKED';

            if (!existingDoc) {
                return NextResponse.json({ error: 'Kaldırılacak aktif erişim kaydı bulunamadı.' }, { status: 404 });
            }

            accessId = existingDoc.id;
            const existingSources = (existingDoc.data()?.grantSources as any[]) || [];
            const remainingSources = existingSources.filter(s => s.type !== 'MANUAL');

            await adminDb.collection('youtuber_mod_access').doc(accessId).update({
                status: 'REVOKED',
                syncStatus: 'PENDING',
                manualDecision: 'FORCE_DENY',
                grantSources: remainingSources,
                revokedAt: now,
                revokedByUserId: userId,
                revokeReason: typeof revokeReason === 'string' ? revokeReason : 'Manuel olarak kaldırıldı.',
                updatedAt: now
            });
        } else {
            return NextResponse.json({ error: 'Geçersiz işlem türü.' }, { status: 400 });
        }

        // Audit event
        await adminDb.collection('mod_access_events').add({
            youtuberModAccessId: accessId,
            modProjectId: modId,
            youtuberId,
            eventType,
            actorUserId: userId,
            metadata: { action, reason: typeof revokeReason === 'string' ? revokeReason : null },
            createdAt: now
        });

        // Trigger sync job and try immediate execution
        const job = await createOrCoalesceSyncJob(modId, userId, triggerType);
        const syncExec = await processSyncJob(job.id);

        return NextResponse.json({
            success: true,
            accessId,
            syncResult: syncExec
        });
    } catch (err: unknown) {
        console.error('Error in POST /api/mods/[modId]/access:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ error: 'Erişim güncellenirken sunucu hatası oluştu.' }, { status: 500 });
    }
}
