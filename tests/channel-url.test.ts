import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChannelUrl } from '../src/lib/channel-url';

test('boş değer alanın kaldırılması için boş metin döner', () => {
    assert.equal(normalizeChannelUrl('   '), '');
});

test('protokol yoksa https eklenir ve boşluklar kırpılır', () => {
    assert.equal(normalizeChannelUrl(' youtube.com/@kanal '), 'https://youtube.com/@kanal');
    assert.equal(normalizeChannelUrl('https://www.youtube.com/channel/UC123'), 'https://www.youtube.com/channel/UC123');
});

test('geçersiz veya http(s) dışı değerler reddedilir', () => {
    assert.equal(normalizeChannelUrl('javascript://alert(1)'), null);
    assert.equal(normalizeChannelUrl('ftp://youtube.com/@kanal'), null);
    assert.equal(normalizeChannelUrl('kanal adı'), null);
    assert.equal(normalizeChannelUrl('https://user:pass@youtube.com/@kanal'), null);
});
