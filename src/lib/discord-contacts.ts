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

export function selectDiscordContacts(categories: DiscordExportCategory[], selectedNames: string[]): DiscordContact[] {
    const selected = new Set(selectedNames);
    return categories.filter(category => selected.has(category.name)).flatMap(category => category.contacts);
}
