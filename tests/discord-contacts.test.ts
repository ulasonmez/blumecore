import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscordExport, buildSelectedDiscordExport } from '../src/lib/discord-contacts';

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

test('Individual selection excludes unchecked people across categories and deduplicates shared contacts', () => {
    const shared = { id: '1', name: 'Shared', discordId: '1234567890123456789' };
    const contacts = [shared, { id: '2', name: 'Other', discordId: 'other' }, shared];
    assert.equal(buildSelectedDiscordExport(contacts, ['1']), 'Shared -> 1234567890123456789');
    assert.equal(buildSelectedDiscordExport(contacts, []), '');
    assert.equal(buildSelectedDiscordExport(contacts, ['1', '2']), 'Other -> other\nShared -> 1234567890123456789');
});
