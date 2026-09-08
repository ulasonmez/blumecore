import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireOwnerUser } from '@/lib/server-auth';
import { YoutuberModAccess, ModProject } from '@/lib/mods/types';

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

        const accessSnap = await adminDb
            .collection('youtuber_mod_access')
            .where('youtuberId', '==', youtuberId)
            .where('userId', '==', userId)
            .where('status', '==', 'ACTIVE')
            .get();

        const activeModIds = new Set<string>();

        for (const aDoc of accessSnap.docs) {
            const data = aDoc.data() as YoutuberModAccess;
            if (data.manualDecision === 'FORCE_DENY') continue;
            if (!data.modProjectId) continue;

            const modSnap = await adminDb.collection('mod_projects').doc(data.modProjectId).get();
            if (modSnap.exists) {
                const modData = modSnap.data() as ModProject;
                if (modData.isActive && !modData.isArchived) {
                    activeModIds.add(data.modProjectId);
                }
            }
        }

        return NextResponse.json({ activeModCount: activeModIds.size });
    } catch (err: unknown) {
        console.error('Error in GET /api/youtubers/[youtuberId]/active-mods-count:', err instanceof Error ? err.message : 'Unknown error');
        return NextResponse.json({ activeModCount: 0 });
    }
}
