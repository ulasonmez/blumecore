import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscordExport, buildFollowUpDiscordCategories, buildSelectedDiscordExport } from '../src/lib/discord-contacts';

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

test('Country export uses current catalog countries across statuses and excludes an entire unchecked country', () => {
    const contacts = [
        { id: '1', name: 'Zeta', groupId: 'tr', discordId: 'zeta' },
        { id: '2', name: 'Beta', groupId: 'de', discordId: '1234567890123456789' },
        { id: '3', name: 'Alpha', groupId: 'tr', discordId: 'alpha' },
        { id: '4', name: 'No Discord', groupId: 'tr' },
        { id: '5', name: 'Outside current filter', groupId: 'de', discordId: 'outside' },
    ];
    const followUps = [
        { youtuberId: '1', country: 'Old country', status: 'Waiting' },
        { youtuberId: '2', country: 'Old country', status: 'Done' },
        { youtuberId: '3', status: 'Done' },
        { youtuberId: '1', status: 'Done' },
        { youtuberId: '4', status: 'Waiting' },
    ];
    const categories = buildFollowUpDiscordCategories(followUps, contacts, [{ id: 'tr', name: 'Türkiye' }, { id: 'de', name: 'Almanya' }]);

    assert.deepEqual(categories.map(category => [category.name, category.contacts.map(contact => contact.id)]), [
        ['Almanya', ['2']], ['Türkiye', ['3', '4', '1']],
    ]);
    const allContacts = categories.flatMap(category => category.contacts);
    const selectedIds = categories.filter(category => category.name !== 'Türkiye').flatMap(category => category.contacts.map(contact => contact.id));
    assert.equal(buildSelectedDiscordExport(allContacts, selectedIds), 'Beta -> 1234567890123456789');
});

test('Country export falls back to the latest visible follow-up country and lists missing countries last', () => {
    const categories = buildFollowUpDiscordCategories([
        { youtuberId: '1', country: ' Fransa ' },
        { youtuberId: '1', country: 'Older country' },
        { youtuberId: '2', country: '-' },
        { youtuberId: '3', country: ' ' },
        { youtuberId: '4' },
        { youtuberId: 'deleted', country: 'İtalya' },
        { country: 'İspanya' },
    ], [
        { id: '1', name: 'A', groupId: 'deleted-group', discordId: 'a' },
        { id: '2', name: 'B', discordId: 'b' },
        { id: '3', name: 'C', discordId: 'c' },
        { id: '4', name: 'D', discordId: 'd' },
    ], []);
    assert.deepEqual(categories.map(category => [category.name, category.contacts.map(contact => contact.id)]), [
        ['Fransa', ['1']], ['Ülke belirtilmedi', ['2', '3', '4']],
    ]);
    assert.deepEqual(buildFollowUpDiscordCategories([], [], []), []);
});
