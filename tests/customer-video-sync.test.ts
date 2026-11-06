import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { NextRequest } from 'next/server';
import {
    buildPendingItem,
    decideCustomerVideoUpdate,
    extractYoutubeVideoId,
    getCheckSchedule,
    parseCheckedAssignmentIds,
    parseCustomerVideoSubmission,
    selectDueItems,
    resolveAutoThreshold,
    CustomerVideoSubmission
} from '../src/lib/customer-video-sync';
import { requireCustomerVideoSyncSecret } from '../src/lib/server-auth';
import { POST } from '../src/app/api/integrations/customer-videos/route';
import { GET } from '../src/app/api/integrations/customer-videos/pending/route';
import { POST as POST_CHECKED } from '../src/app/api/integrations/customer-videos/checked/route';

const SECRET = 'a'.repeat(40);
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function submission(overrides: Partial<CustomerVideoSubmission> = {}): CustomerVideoSubmission {
    return {
        assignmentId: 'as1',
        url: 'https://www.youtube.com/watch?v=abcDEF12345',
        videoId: 'abcDEF12345',
        title: 'Minecraft But Everything Is Guns',
        confidence: 0.95,
        reason: 'Başlık birebir eşleşiyor',
        ...overrides
    };
}

describe('extractYoutubeVideoId', () => {
    it('farklı link biçimlerinden aynı kimliği çıkarır', () => {
        for (const url of [
            'https://www.youtube.com/watch?v=abcDEF12345&t=30',
            'https://youtu.be/abcDEF12345',
            'https://m.youtube.com/shorts/abcDEF12345',
            'https://youtube.com/live/abcDEF12345/'
        ]) {
            assert.equal(extractYoutubeVideoId(url), 'abcDEF12345');
        }
    });

    it('geçersiz bağlantıları reddeder', () => {
        for (const url of ['http://youtu.be/abcDEF12345', 'https://youtube.com/channel/abc', 'https://evil.test/watch?v=abcDEF12345', '']) {
            assert.equal(extractYoutubeVideoId(url), null);
        }
    });
});

describe('parseCustomerVideoSubmission', () => {
    it('geçerli gövdeyi kanonik bağlantıya çevirir', () => {
        const result = parseCustomerVideoSubmission({
            assignmentId: ' as1 ',
            customerVideoUrl: 'https://youtu.be/abcDEF12345?si=track',
            confidence: 0.7,
            matchedTitle: '  Başlık\nalt satır ',
            reason: 42
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.submission.assignmentId, 'as1');
        assert.equal(result.submission.url, 'https://www.youtube.com/watch?v=abcDEF12345');
        assert.equal(result.submission.title, 'Başlık alt satır');
        assert.equal(result.submission.reason, null);
    });

    it('eksik/hatalı alanları reddeder', () => {
        const base = { assignmentId: 'as1', customerVideoUrl: 'https://youtu.be/abcDEF12345', confidence: 0.5 };
        assert.equal(parseCustomerVideoSubmission(null).ok, false);
        assert.equal(parseCustomerVideoSubmission([]).ok, false);
        assert.equal(parseCustomerVideoSubmission({ ...base, assignmentId: '' }).ok, false);
        assert.equal(parseCustomerVideoSubmission({ ...base, assignmentId: 'a/b' }).ok, false);
        assert.equal(parseCustomerVideoSubmission({ ...base, customerVideoUrl: 'javascript:alert(1)' }).ok, false);
        assert.equal(parseCustomerVideoSubmission({ ...base, confidence: 1.5 }).ok, false);
        assert.equal(parseCustomerVideoSubmission({ ...base, confidence: '0.9' }).ok, false);
    });
});

describe('resolveAutoThreshold', () => {
    it('geçersiz değerlerde varsayılanı kullanır', () => {
        assert.equal(resolveAutoThreshold(undefined), 0.85);
        assert.equal(resolveAutoThreshold(''), 0.85);
        assert.equal(resolveAutoThreshold('abc'), 0.85);
        assert.equal(resolveAutoThreshold('0'), 0.85);
        assert.equal(resolveAutoThreshold('1.2'), 0.85);
        assert.equal(resolveAutoThreshold('0.9'), 0.9);
    });
});

describe('decideCustomerVideoUpdate', () => {
    it('mevcut bağlantının (elle girilmiş) üzerine asla yazmaz', () => {
        const d = decideCustomerVideoUpdate({ customerVideoUrl: 'https://youtu.be/manual12345' }, submission(), 0.85, NOW);
        assert.equal(d.outcome, 'ALREADY_SET');
        assert.equal(d.set, null);
    });

    it('reddedilen videoyu tekrar yazmaz veya önermez', () => {
        const d = decideCustomerVideoUpdate({ customerVideoRejectedIds: ['abcDEF12345'] }, submission(), 0.85, NOW);
        assert.equal(d.outcome, 'PREVIOUSLY_REJECTED');
        assert.equal(d.set, null);
    });

    it('eşik ve üstünde bağlantıyı yazar, bekleyen öneriyi kaldırır', () => {
        const d = decideCustomerVideoUpdate({ customerVideoSuggestion: { url: 'x', videoId: 'other123456', confidence: 0.5 } }, submission({ confidence: 0.85 }), 0.85, NOW);
        assert.equal(d.outcome, 'AUTO_SET');
        assert.equal(d.set?.customerVideoUrl, 'https://www.youtube.com/watch?v=abcDEF12345');
        assert.equal(d.set?.customerVideoSource, 'auto');
        assert.deepEqual(d.remove, ['customerVideoSuggestion']);
        assert.equal((d.set?.customerVideoMatch as { matchedAt: number }).matchedAt, NOW);
    });

    it('eşik altında öneri kaydeder ve bağlantıya dokunmaz', () => {
        const d = decideCustomerVideoUpdate({}, submission({ confidence: 0.6 }), 0.85, NOW);
        assert.equal(d.outcome, 'SUGGESTED');
        assert.equal(d.set?.customerVideoUrl, undefined);
        assert.equal((d.set?.customerVideoSuggestion as { confidence: number }).confidence, 0.6);
        assert.deepEqual(d.remove, []);
    });

    it('daha düşük/eşit güvenli öneri mevcut öneriyi değiştirmez, daha yükseği değiştirir', () => {
        const state = { customerVideoSuggestion: { url: 'https://www.youtube.com/watch?v=old12345678', videoId: 'old12345678', confidence: 0.7 } };
        assert.equal(decideCustomerVideoUpdate(state, submission({ confidence: 0.7 }), 0.85, NOW).outcome, 'DUPLICATE_SUGGESTION');
        assert.equal(decideCustomerVideoUpdate(state, submission({ confidence: 0.5 }), 0.85, NOW).outcome, 'DUPLICATE_SUGGESTION');
        assert.equal(decideCustomerVideoUpdate(state, submission({ confidence: 0.8 }), 0.85, NOW).outcome, 'SUGGESTED');
    });
});

describe('buildPendingItem', () => {
    it('bağlantısı olan atamayı listeye almaz', () => {
        assert.equal(buildPendingItem('as1', { customerVideoUrl: 'https://youtu.be/abcDEF12345' }, null, null), null);
    });

    it('YouTuber, orijinal video, öneri ve ret bilgisini birleştirir', () => {
        const item = buildPendingItem(
            'as1',
            {
                youtuberId: 'yt1', videoId: 'v1', name: 'Eski Ad', createdAt: NOW,
                customerVideoSuggestion: { url: 'https://www.youtube.com/watch?v=abcDEF12345', videoId: 'abcDEF12345', title: 'T', confidence: 0.6 },
                customerVideoRejectedIds: ['zzz', 5]
            },
            { name: 'Güncel Ad', channelUrl: ' https://youtube.com/@kanal ' },
            { title: 'Orijinal', url: 'https://youtu.be/orig1234567' },
            NOW
        );
        assert.deepEqual(item, {
            assignmentId: 'as1',
            assignedAt: NOW,
            lastCheckedAt: null,
            checkIntervalDays: 1,
            youtuber: { id: 'yt1', name: 'Güncel Ad', channelUrl: 'https://youtube.com/@kanal' },
            originalVideo: { id: 'v1', title: 'Orijinal', url: 'https://youtu.be/orig1234567' },
            pendingSuggestion: { url: 'https://www.youtube.com/watch?v=abcDEF12345', videoId: 'abcDEF12345', title: 'T', confidence: 0.6 },
            rejectedVideoIds: ['zzz']
        });
    });

    it('YouTuber kaydı yoksa atamadaki adı kullanır; Timestamp benzeri tarihi çevirir', () => {
        const item = buildPendingItem('as2', { youtuberId: 'yt9', name: 'Kayıtlı Ad', createdAt: { toMillis: () => 123 } }, null, null, NOW);
        assert.equal(item?.youtuber.name, 'Kayıtlı Ad');
        assert.equal(item?.youtuber.channelUrl, null);
        assert.equal(item?.assignedAt, 123);
    });
});

describe('Kontrol takvimi', () => {
    it('satış yaşına göre aralık belirler', () => {
        assert.equal(getCheckSchedule(NOW - 5 * DAY, null, NOW).intervalDays, 1);
        assert.equal(getCheckSchedule(NOW - 45 * DAY, null, NOW).intervalDays, 7);
        assert.equal(getCheckSchedule(NOW - 120 * DAY, null, NOW).intervalDays, 30);
        assert.equal(getCheckSchedule(NOW - 400 * DAY, null, NOW).intervalDays, null);
        assert.equal(getCheckSchedule(null, null, NOW).intervalDays, 30);
    });

    it('hiç kontrol edilmemiş atama, yaşı ne olursa olsun bir kez kontrol edilir', () => {
        assert.equal(getCheckSchedule(NOW - 400 * DAY, null, NOW).due, true);
        assert.equal(getCheckSchedule(NOW - 400 * DAY, NOW - 100 * DAY, NOW).due, false);
    });

    it('4 aylık satış ayda bir kontrol edilir', () => {
        const sold = NOW - 120 * DAY;
        assert.equal(getCheckSchedule(sold, NOW - 10 * DAY, NOW).due, false);
        assert.equal(getCheckSchedule(sold, NOW - 29 * DAY, NOW).due, false);
        assert.equal(getCheckSchedule(sold, NOW - 30 * DAY, NOW).due, true);
    });

    it('günlük tetikleyicinin birkaç saatlik kaymasını tolere eder', () => {
        const sold = NOW - 3 * DAY;
        assert.equal(getCheckSchedule(sold, NOW - DAY + 2 * 60 * 60 * 1000, NOW).due, true);
        assert.equal(getCheckSchedule(sold, NOW - 12 * 60 * 60 * 1000, NOW).due, false);
    });

    it('selectDueItems yalnızca zamanı gelenleri seçer; all tüm listeyi döner', () => {
        const base = buildPendingItem('a', { youtuberId: 'y', createdAt: NOW - 120 * DAY }, null, null, NOW)!;
        const fresh = { ...base, assignmentId: 'fresh', lastCheckedAt: NOW - 5 * DAY };
        const stale = { ...base, assignmentId: 'stale', lastCheckedAt: NOW - 31 * DAY };
        const due = selectDueItems([fresh, stale], NOW, false);
        assert.deepEqual(due.items.map(i => i.assignmentId), ['stale']);
        assert.equal(due.notDue, 1);
        assert.equal(selectDueItems([fresh, stale], NOW, true).items.length, 2);
    });

    it('parseCheckedAssignmentIds kimlikleri doğrular ve tekilleştirir', () => {
        const ok = parseCheckedAssignmentIds({ assignmentIds: [' a ', 'b', 'a'] });
        assert.deepEqual(ok.ok && ok.ids, ['a', 'b']);
        assert.equal(parseCheckedAssignmentIds({ assignmentIds: [] }).ok, false);
        assert.equal(parseCheckedAssignmentIds({ assignmentIds: ['a/b'] }).ok, false);
        assert.equal(parseCheckedAssignmentIds({ assignmentIds: Array.from({ length: 201 }, (_, i) => `id${i}`) }).ok, false);
        assert.equal(parseCheckedAssignmentIds(null).ok, false);
    });
});

describe('Entegrasyon anahtarı ve route ön kontrolleri', () => {
    const originalEnv = { ...process.env };
    beforeEach(() => {
        process.env.CUSTOMER_VIDEO_SYNC_SECRET = SECRET;
        process.env.ADMIN_FIREBASE_UID = 'owner-uid';
        process.env.CRON_SECRET = 'b'.repeat(40);
    });
    afterEach(() => {
        process.env = { ...originalEnv };
    });

    const req = (auth?: string, init: { method?: string; body?: string } = {}) =>
        new NextRequest('http://localhost:3000/api/integrations/customer-videos', {
            method: init.method ?? 'GET',
            body: init.body,
            headers: auth ? { authorization: auth, 'content-type': 'application/json' } : { 'content-type': 'application/json' }
        });

    it('doğru anahtarı kabul eder', () => {
        assert.equal(requireCustomerVideoSyncSecret(req(`Bearer ${SECRET}`)).ok, true);
    });

    it('eksik, yanlış veya CRON anahtarını reddeder', () => {
        for (const header of [undefined, 'Bearer yanlis', `Bearer ${'b'.repeat(40)}`, SECRET, `Bearer ${SECRET}x`]) {
            const result = requireCustomerVideoSyncSecret(req(header));
            assert.equal(result.ok, false);
            if (!result.ok) assert.equal(result.response.status, 401);
        }
    });

    it('anahtar tanımsız veya kısaysa fail-closed çalışır', () => {
        delete process.env.CUSTOMER_VIDEO_SYNC_SECRET;
        let result = requireCustomerVideoSyncSecret(req(`Bearer ${SECRET}`));
        assert.equal(!result.ok && result.response.status, 503);
        process.env.CUSTOMER_VIDEO_SYNC_SECRET = 'kisa';
        result = requireCustomerVideoSyncSecret(req('Bearer kisa'));
        assert.equal(!result.ok && result.response.status, 503);
    });

    it('route\'lar yetkisiz isteği veritabanına gitmeden reddeder', async () => {
        assert.equal((await GET(req())).status, 401);
        assert.equal((await POST(req('Bearer yanlis', { method: 'POST', body: '{}' }))).status, 401);
        assert.equal((await POST_CHECKED(req('Bearer yanlis', { method: 'POST', body: '{}' }))).status, 401);
        assert.equal((await POST_CHECKED(req(`Bearer ${SECRET}`, { method: 'POST', body: '{"assignmentIds":[]}' }))).status, 400);
    });

    it('POST hatalı gövdeyi veritabanına gitmeden 400 ile reddeder', async () => {
        assert.equal((await POST(req(`Bearer ${SECRET}`, { method: 'POST', body: 'json değil' }))).status, 400);
        const res = await POST(req(`Bearer ${SECRET}`, { method: 'POST', body: JSON.stringify({ assignmentId: 'as1', customerVideoUrl: 'https://evil.test', confidence: 0.9 }) }));
        assert.equal(res.status, 400);
    });
});
