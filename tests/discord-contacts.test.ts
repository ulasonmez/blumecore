import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscordExport, selectDiscordContacts } from '../src/lib/discord-contacts';

test('Discord export excludes empty IDs, deduplicates YouTubers and preserves long IDs as text', () => {
    const contact = { id: '1', name: 'Alpha', discordId: ' 1234567890123456789 ' };
    assert.equal(buildDiscordExport([
        { id: '2', name: 'Beta', discordId: 'beta.user' }, contact, contact,
        { id: '3', name: 'Empty', discordId: ' ' }, { id: '4', name: 'Legacy' },
    ]), 'Alpha -> 1234567890123456789\nBeta -> beta.user');
});

test('Discord export keeps one person per line even with legacy multiline values', () => {
    assert.equal(buildDiscordExport([{ id: '1', name: 'A\nB', discordId: 'user\r\nname' }]), 'A B -> user name');
    assert.equal(buildDiscordExport([]), '');
});

test('Category selection filters before deduplication and allows an empty selection', () => {
    const shared = { id: '1', name: 'Shared', discordId: '1234567890123456789' };
    const categories = [
        { name: 'Eski müşteri', contacts: [shared, { id: '2', name: 'Other', discordId: 'other' }] },
        { name: 'Mod aldı ödemedi', contacts: [shared] },
    ];
    assert.equal(buildDiscordExport(selectDiscordContacts(categories, ['Mod aldı ödemedi'])), 'Shared -> 1234567890123456789');
    assert.equal(buildDiscordExport(selectDiscordContacts(categories, [])), '');
    assert.equal(buildDiscordExport(selectDiscordContacts(categories, categories.map(category => category.name))), 'Other -> other\nShared -> 1234567890123456789');
});
