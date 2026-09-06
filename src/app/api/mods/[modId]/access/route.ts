import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    addDoc,
    updateDoc
} from 'firebase/firestore';
import { YoutuberModAccess, YoutuberAccessSummary } from '@/lib/mods/types';
import { getActiveMinecraftPlayersForYoutuber } from '@/lib/minecraft-players';
import { createOrCoalesceSyncJob, processSyncJob } from '@/lib/mods/mod-service';
import { getAuthenticatedUser } from '@/lib/server-auth';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        const qAccess = query(
            collection(db, 'youtuber_mod_access'),
            where('modProjectId', '==', modId),
            where('userId', '==', userId)
        );
        const accessSnap = await getDocs(qAccess);

        const summaries: YoutuberAccessSummary[] = [];

        for (const aDoc of accessSnap.docs) {
            const access = { id: aDoc.id, ...(aDoc.data() as Omit<YoutuberModAccess, 'id'>) };

            const ySnap = await getDoc(doc(db, 'youtubers', access.youtuberId));
            const youtuberName = ySnap.exists() ? ySnap.data()?.name || 'Bilinmeyen' : 'Bilinmeyen';

            const activePlayers = await getActiveMinecraftPlayersForYoutuber(access.youtuberId);

            summaries.push({
                access,
                youtuberName,
                activePlayerCount: activePlayers.length,
                players: activePlayers
            });
        }

        return NextResponse.json({ data: summaries });
    } catch (err: unknown) {
        console.error('Error in GET /api/mods/[modId]/access:', err);
        return NextResponse.json({ error: 'Yetki listesi alınırken hata oluştu.' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ modId: string }> }
) {
    try {
        const { modId } = await context.params;
        const authUser = await getAuthenticatedUser(request);
        if (!authUser) {
            return NextResponse.json({ error: 'Yetkilendirme hatası: Oturum açmanız gerekmektedir.' }, { status: 401 });
        }
        const userId = authUser.userId;

        const body = await request.json();
        const { youtuberId, action, revokeReason } = body;

        if (!youtuberId || !action) {
            return NextResponse.json({ error: 'YouTuber ID ve işlem türü gereklidir.' }, { status: 400 });
        }

        // Verify mod ownership
        const modSnap = await getDoc(doc(db, 'mod_projects', modId));
        if (!modSnap.exists() || (!authUser.isSystemAdmin && modSnap.data()?.userId !== userId)) {
            return NextResponse.json({ error: 'Mod bulunamadı veya yetkisiz erişim.' }, { status: 404 });
        }

        // Check existing access
        const qAccess = query(
            collection(db, 'youtuber_mod_access'),
            where('modProjectId', '==', modId),
            where('youtuberId', '==', youtuberId),
            where('userId', '==', userId)
        );
        const accessSnap = await getDocs(qAccess);
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
                await updateDoc(doc(db, 'youtuber_mod_access', accessId), {
                    status: 'ACTIVE',
                    syncStatus: 'PENDING',
                    manualDecision: 'FORCE_ALLOW',
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
                    manualDecision: 'FORCE_ALLOW',
                    grantedAt: now,
                    grantedByUserId: userId,
                    userId,
                    createdAt: now,
                    updatedAt: now
                };
                const ref = await addDoc(collection(db, 'youtuber_mod_access'), newAccess);
                accessId = ref.id;
            }
        } else if (action === 'revoke') {
            triggerType = 'MANUAL_ACCESS_REVOKED';
            eventType = 'MANUAL_REVOKED';

            if (!existingDoc) {
                return NextResponse.json({ error: 'Kaldırılacak aktif erişim kaydı bulunamadı.' }, { status: 404 });
            }

            accessId = existingDoc.id;
            await updateDoc(doc(db, 'youtuber_mod_access', accessId), {
                status: 'REVOKED',
                syncStatus: 'PENDING',
                manualDecision: 'FORCE_DENY',
                revokedAt: now,
                revokedByUserId: userId,
                revokeReason: revokeReason || 'Manuel olarak kaldırıldı.',
                updatedAt: now
            });
        } else {
            return NextResponse.json({ error: 'Geçersiz işlem türü.' }, { status: 400 });
        }

        // Audit event
        await addDoc(collection(db, 'mod_access_events'), {
            youtuberModAccessId: accessId,
            modProjectId: modId,
            youtuberId,
            eventType,
            actorUserId: userId,
            metadata: { action, reason: revokeReason || null },
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
        console.error('Error in POST /api/mods/[modId]/access:', err);
        const message = err instanceof Error ? err.message : 'Erişim güncellenirken hata oluştu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
