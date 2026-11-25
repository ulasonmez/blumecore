import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUnpaidVideoGroups } from '../src/lib/unpaid-videos';

const videos = [
    { id: 'v1', title: 'İnek Modu' },
    { id: 'v2', title: 'Ejderha Modu' },
    { id: 'v3', title: 'Zombi Modu' },
];
const youtubers = [
    { id: 'y1', name: 'Zeynep' },
    { id: 'y2', name: 'çağrı' },
    { id: 'y3', name: 'Ali' },
];

test('yalnızca ödenmedi durumundaki atamalar YouTuber bazında gruplanır', () => {
    const groups = buildUnpaidVideoGroups(
        [
            { id: 'a1', youtuberId: 'y1', videoId: 'v1', createdAt: 100, note: ' not ' },
            { id: 'a2', youtuberId: 'y1', videoId: 'v2', createdAt: 200 },
            { id: 'a3', youtuberId: 'y1', videoId: 'v3', createdAt: 300 },
            { id: 'a4', youtuberId: 'y2', videoId: 'v1', createdAt: 50 },
            { id: 'a5', youtuberId: 'y3', videoId: 'v1', createdAt: 10 },
        ],
        [
            // y1: v2 tam, v3 kısmi ödendi
            { id: 'r1', youtuberId: 'y1', type: 'income', paidVideos: [{ videoId: 'v2', coverage: 'full' }, { videoId: 'v3', coverage: 'partial' }] },
            // y3'ün v1'i ödendi; y2'nin v1'i ödenmedi (ödeme başka YouTuber'a ait)
            { id: 'r2', youtuberId: 'y3', type: 'income', paidVideos: [{ videoId: 'v1', coverage: 'full' }] },
        ],
        videos,
        youtubers,
    );

    assert.deepEqual(groups.map(g => g.youtuberName), ['çağrı', 'Zeynep']);
    assert.deepEqual(groups[1].items, [
        { assignmentId: 'a1', videoId: 'v1', videoTitle: 'İnek Modu', note: 'not', createdAt: 100 },
    ]);
    assert.deepEqual(groups[0].items.map(i => i.assignmentId), ['a4']);
});

test('mod kaynaklı, katalogda olmayan ve gider kaydıyla bağlanan atamalar doğru ele alınır', () => {
    const groups = buildUnpaidVideoGroups(
        [
            { id: 'a1', youtuberId: 'y1', videoId: 'v1', source: 'mods' },
            { id: 'a2', youtuberId: 'y1', videoId: 'silinmis' },
            { id: 'a3', youtuberId: 'y1', videoId: 'v2', createdAt: 1 },
            { id: 'a4', youtuberId: 'y1', videoId: 'v3', createdAt: 2 },
            { id: 'a5', youtuberId: 'yok', videoId: 'v3', name: 'Eski Kişi' },
        ],
        [
            { id: 'r1', youtuberId: 'y1', type: 'expense', paidVideos: [{ videoId: 'v2', coverage: 'full' }] },
            // Eski biçim: atama kimliğiyle bağlantı
            { id: 'r2', youtuberId: 'y1', type: 'income', paidAssignments: [{ assignmentId: 'a4', coverage: 'full' }] },
        ],
        videos,
        youtubers,
    );

    assert.deepEqual(groups.map(g => [g.youtuberName, g.items.map(i => i.assignmentId)]), [
        ['Eski Kişi', ['a5']],
        ['Zeynep', ['a3']],
    ]);
});

test('aynı video aynı kişiye iki kez satıldıysa iki satır da gösterilir, en yeni önce', () => {
    const groups = buildUnpaidVideoGroups(
        [
            { id: 'a1', youtuberId: 'y3', videoId: 'v1', createdAt: 10 },
            { id: 'a2', youtuberId: 'y3', videoId: 'v1', createdAt: 20 },
        ],
        [],
        videos,
        youtubers,
    );
    assert.deepEqual(groups[0].items.map(i => i.assignmentId), ['a2', 'a1']);
});
