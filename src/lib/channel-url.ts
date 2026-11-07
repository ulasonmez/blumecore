/**
 * YouTuber kanal bağlantısını kaydetmeden önce normalleştirir.
 * Boş değer '' döner (alan kaldırılır); geçersiz değer null döner.
 * Protokol yazılmamışsa https:// eklenir; yalnızca http(s) kabul edilir.
 */
export function normalizeChannelUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.username || url.password || !url.hostname.includes('.')) return null;
        return url.toString();
    } catch {
        return null;
    }
}
