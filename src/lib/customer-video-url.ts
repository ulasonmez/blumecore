export function normalizeCustomerVideoUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        if (host === 'youtu.be' && /^\/[^/]+\/?$/.test(url.pathname)) return url.toString();
        if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return null;
        if (url.pathname === '/watch' && url.searchParams.get('v')) return url.toString();
        if (/^\/(shorts|live|embed)\/[^/]+\/?$/.test(url.pathname)) return url.toString();
        return null;
    } catch {
        return null;
    }
}
