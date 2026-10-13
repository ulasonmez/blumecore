export interface DiscordContact {
    id: string;
    name: string;
    discordId?: string | null;
}

export function buildDiscordExport(contacts: DiscordContact[]): string {
    const unique = new Map(contacts.map(contact => [contact.id, contact]));
    return [...unique.values()]
        .filter(contact => contact.discordId?.trim())
        .sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id))
        .map(contact => `${contact.name.replace(/[\r\n]+/g, ' ').trim()} -> ${contact.discordId!.replace(/[\r\n]+/g, ' ').trim()}`)
        .join('\n');
}

export interface DiscordExportCategory {
    name: string;
    contacts: DiscordContact[];
}

export function buildFollowUpDiscordCategories(
    followUps: { youtuberId?: string; country?: string }[],
    contacts: (DiscordContact & { groupId?: string })[],
    groups: { id: string; name: string }[],
): DiscordExportCategory[] {
    const contactsById = new Map(contacts.map(contact => [contact.id, contact]));
    const countriesByGroupId = new Map(groups.map(group => [group.id, group.name]));
    const categories = new Map<string, DiscordContact[]>();
    const seen = new Set<string>();
    const unknownCountry = 'Ülke belirtilmedi';

    for (const followUp of followUps) {
        const contact = followUp.youtuberId ? contactsById.get(followUp.youtuberId) : undefined;
        if (!contact || seen.has(contact.id)) continue;
        seen.add(contact.id);

        const country = (countriesByGroupId.get(contact.groupId || '') ?? followUp.country)?.trim();
        const name = country && country !== '-' ? country : unknownCountry;
        const categoryContacts = categories.get(name) || [];
        categoryContacts.push(contact);
        categories.set(name, categoryContacts);
    }

    return [...categories].sort(([a], [b]) => {
        if (a === b) return 0;
        if (a === unknownCountry) return 1;
        if (b === unknownCountry) return -1;
        return a.localeCompare(b, 'tr');
    }).map(([name, countryContacts]) => ({
        name,
        contacts: countryContacts.sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id)),
    }));
}

export function buildSelectedDiscordExport(contacts: DiscordContact[], selectedIds: string[]): string {
    const selected = new Set(selectedIds);
    return buildDiscordExport(contacts.filter(contact => selected.has(contact.id)));
}
