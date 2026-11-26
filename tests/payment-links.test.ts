import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildPaymentMapsByYoutuber,
    buildVideoPaymentMap,
    convertLegacyLinks,
    getVideoPaymentStatus,
    getYoutuberVideoPaymentStatus,
    matchesVideoSearch,
    readPaidVideos,
    resolveRecordPaidVideos,
} from '../src/lib/payment-links';

test('readPaidVideos geçersiz girdileri atar ve tekrarları birleştirir', () => {
    assert.deepEqual(readPaidVideos(undefined), []);
    assert.deepEqual(readPaidVideos('x'), []);
    assert.deepEqual(
        readPaidVideos([
            { videoId: 'a', coverage: 'partial' },
            { videoId: 'a', coverage: 'full' },
            { videoId: '', coverage: 'full' },
            { videoId: 'b' },
            null,
            { videoId: 'c', coverage: 'partial' },
        ]),
        [
            { videoId: 'a', coverage: 'full' },
            { videoId: 'b', coverage: 'full' },
            { videoId: 'c', coverage: 'partial' },
        ],
    );
});

test('Bir ödeme birden fazla videoyu kapsar; tam > kısmi > ödenmedi', () => {
    const records = [
        { id: 'r1', type: 'income', paidVideos: [{ videoId: 'v1', coverage: 'full' }, { videoId: 'v2', coverage: 'partial' }] },
        { id: 'r2', type: 'income', paidVideos: [{ videoId: 'v3', coverage: 'partial' }] },
        { id: 'r3', type: 'income', paidVideos: [{ videoId: 'v3', coverage: 'full' }] },
        { id: 'r4', type: 'expense', paidVideos: [{ videoId: 'v4', coverage: 'full' }] },
        { id: 'r5', type: 'income' },
    ];
    const map = buildVideoPaymentMap(records);
    assert.equal(getVideoPaymentStatus(map, 'v1'), 'paid');
    assert.equal(getVideoPaymentStatus(map, 'v2'), 'partial');
    assert.equal(getVideoPaymentStatus(map, 'v3'), 'paid');
    assert.deepEqual(map.get('v3')?.recordIds, ['r2', 'r3']);
    assert.equal(getVideoPaymentStatus(map, 'v4'), 'unpaid', 'gider kayıtları ödeme sayılmaz');
    assert.equal(getVideoPaymentStatus(map, 'missing'), 'unpaid');
});

test('Eski atama bağlantıları videoya çevrilir; düzenlenen kayıt hariç tutulabilir', () => {
    const assignmentToVideo = new Map([['as1', 'v1'], ['as2', 'v2']]);
    assert.deepEqual(
        convertLegacyLinks([{ assignmentId: 'as1', coverage: 'partial' }, { assignmentId: 'gone', coverage: 'full' }], assignmentToVideo),
        [{ videoId: 'v1', coverage: 'partial' }],
    );
    const legacyRecord = { id: 'old', type: 'income', paidAssignments: [{ assignmentId: 'as2', coverage: 'full' }], paidVideos: [{ videoId: 'v1', coverage: 'partial' }] };
    assert.deepEqual(resolveRecordPaidVideos(legacyRecord, assignmentToVideo), [
        { videoId: 'v1', coverage: 'partial' },
        { videoId: 'v2', coverage: 'full' },
    ]);
    const records = [legacyRecord, { id: 'r2', type: 'income', paidVideos: [{ videoId: 'v2', coverage: 'partial' }] }];
    assert.equal(getVideoPaymentStatus(buildVideoPaymentMap(records, assignmentToVideo), 'v2'), 'paid');
    assert.equal(getVideoPaymentStatus(buildVideoPaymentMap(records, assignmentToVideo, 'old'), 'v2'), 'partial');
});

test('Video araması Türkçe büyük/küçük harf duyarsızdır', () => {
    assert.ok(matchesVideoSearch('Minecraft, But You Milk Any Mob', 'milk'));
    assert.ok(matchesVideoSearch('İnek Sağma Modu', 'inek'));
    assert.ok(matchesVideoSearch('Herhangi', '  '));
    assert.ok(!matchesVideoSearch('Tsunami', 'dragon'));
});

test('Aracı görünümü: durum YouTuber bazında hesaplanır; ödeme başka YouTuber atamasını ödemez', () => {
    const maps = buildPaymentMapsByYoutuber(
        [
            { id: 'r1', youtuberId: 'y1', type: 'income', paidVideos: [{ videoId: 'v1', coverage: 'full' }] },
            { id: 'r2', youtuberId: 'y2', type: 'income', paidVideos: [{ videoId: 'v1', coverage: 'partial' }] },
            { id: 'r3', youtuberId: 'y2', type: 'expense', paidVideos: [{ videoId: 'v2', coverage: 'full' }] },
            { id: 'r4', youtuberId: 'y3', type: 'income', paidAssignments: [{ assignmentId: 'a9', coverage: 'full' }] },
            { id: 'r5', type: 'income', paidVideos: [{ videoId: 'v1', coverage: 'full' }] },
        ],
        new Map([['a9', 'v3']]),
    );

    assert.equal(getYoutuberVideoPaymentStatus(maps, 'y1', 'v1'), 'paid');
    assert.equal(getYoutuberVideoPaymentStatus(maps, 'y2', 'v1'), 'partial');
    assert.equal(getYoutuberVideoPaymentStatus(maps, 'y2', 'v2'), 'unpaid');
    assert.equal(getYoutuberVideoPaymentStatus(maps, 'y3', 'v3'), 'paid');
    assert.equal(getYoutuberVideoPaymentStatus(maps, 'y4', 'v1'), 'unpaid');
    assert.equal(getYoutuberVideoPaymentStatus(maps, undefined, 'v1'), 'unpaid');
});
