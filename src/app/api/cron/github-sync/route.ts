import { NextRequest, NextResponse } from 'next/server';
import { processPendingJobs } from '@/lib/mods/mod-service';
import { requireCronSecret } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
    try {
        const cronAuth = requireCronSecret(request);
        if (!cronAuth.ok) {
            return cronAuth.response;
        }

        const result = await processPendingJobs(20);

        return NextResponse.json({
            success: true,
            processed: result.processed,
            errors: result.errors,
            timestamp: new Date().toISOString()
        });
    } catch (err: unknown) {
        console.error('Error in GET /api/cron/github-sync:', err);
        return NextResponse.json({ error: 'Cron işlemi sırasında sunucu hatası oluştu.' }, { status: 500 });
    }
}
