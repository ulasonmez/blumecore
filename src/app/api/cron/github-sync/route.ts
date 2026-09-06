import { NextRequest, NextResponse } from 'next/server';
import { processPendingJobs } from '@/lib/mods/mod-service';

export async function GET(request: NextRequest) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = request.headers.get('authorization');

        if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Yetkilendirme başarısız (Geçersiz CRON_SECRET).' }, { status: 401 });
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
