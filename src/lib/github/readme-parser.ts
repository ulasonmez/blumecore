import { normalizeUuid } from '../minecraft-players';

export const MANAGED_START_MARKER = '<!-- BLUMECORE-MANAGED-START -->';
export const MANAGED_END_MARKER = '<!-- BLUMECORE-MANAGED-END -->';
export const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface ParsedReadme {
    rawContent: string;
    lineEnding: '\r\n' | '\n';
    hasTrailingNewline: boolean;
    isManagedSectionPresent: boolean;
    hasMalformedMarkers: boolean;
    malformedReason?: string;
    preManagedContent: string;
    postManagedContent: string;
    legacyUuids: string[]; // Normalized canonical UUIDs outside managed section
    managedUuidsByYoutuber: Record<string, string[]>; // youtuberId -> canonical UUIDs
    allManagedUuids: string[];
}

export interface RenderInputGroup {
    youtuberId: string;
    youtuberName: string;
    uuids: string[];
}

export interface RenderResult {
    content: string;
    changed: boolean;
    writtenUuidCount: number;
    skippedLegacyUuidCount: number;
    skippedLegacyUuids: string[];
    isMalformed: boolean;
    error?: string;
}

/**
 * Parses legacy Minecraft README allowlist file.
 */
export function parseLegacyReadme(rawContent: string): ParsedReadme {
    const lineEnding: '\r\n' | '\n' = rawContent.includes('\r\n') ? '\r\n' : '\n';
    const hasTrailingNewline = rawContent.endsWith('\n');

    const startIdx = rawContent.indexOf(MANAGED_START_MARKER);
    const endIdx = rawContent.indexOf(MANAGED_END_MARKER);

    // Check multiple markers
    const secondStartIdx = startIdx !== -1 ? rawContent.indexOf(MANAGED_START_MARKER, startIdx + 1) : -1;
    const secondEndIdx = endIdx !== -1 ? rawContent.indexOf(MANAGED_END_MARKER, endIdx + 1) : -1;

    let hasMalformedMarkers = false;
    let malformedReason: string | undefined;

    if (secondStartIdx !== -1) {
        hasMalformedMarkers = true;
        malformedReason = 'Dosyada birden fazla BLUMECORE-MANAGED-START işareti bulundu.';
    } else if (secondEndIdx !== -1) {
        hasMalformedMarkers = true;
        malformedReason = 'Dosyada birden fazla BLUMECORE-MANAGED-END işareti bulundu.';
    } else if (startIdx !== -1 && endIdx === -1) {
        hasMalformedMarkers = true;
        malformedReason = 'BLUMECORE-MANAGED-START bulundu fakat BLUMECORE-MANAGED-END bulunamadı.';
    } else if (startIdx === -1 && endIdx !== -1) {
        hasMalformedMarkers = true;
        malformedReason = 'BLUMECORE-MANAGED-END bulundu fakat BLUMECORE-MANAGED-START bulunamadı.';
    } else if (startIdx !== -1 && endIdx !== -1 && endIdx < startIdx) {
        hasMalformedMarkers = true;
        malformedReason = 'BLUMECORE-MANAGED-END işareti START işaretinden önce yer alıyor.';
    }

    const isManagedSectionPresent = startIdx !== -1 && endIdx !== -1 && !hasMalformedMarkers;

    let preManagedContent = rawContent;
    let managedContent = '';
    let postManagedContent = '';

    if (isManagedSectionPresent) {
        preManagedContent = rawContent.slice(0, startIdx);
        managedContent = rawContent.slice(startIdx + MANAGED_START_MARKER.length, endIdx);
        postManagedContent = rawContent.slice(endIdx + MANAGED_END_MARKER.length);
    }

    // Extract legacy UUIDs from unmanaged sections (pre and post)
    const legacyUuids: string[] = [];
    const scanLines = (text: string) => {
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (UUID_REGEX.test(trimmed)) {
                legacyUuids.push(normalizeUuid(trimmed));
            }
        }
    };

    scanLines(preManagedContent);
    if (isManagedSectionPresent) {
        scanLines(postManagedContent);
    }

    // Extract managed UUIDs
    const managedUuidsByYoutuber: Record<string, string[]> = {};
    const allManagedUuids: string[] = [];

    if (isManagedSectionPresent) {
        const youtuberBlockRegex = /<!-- BLUMECORE-YOUTUBER:([a-zA-Z0-9_-]+):START -->([\s\S]*?)<!-- BLUMECORE-YOUTUBER:\1:END -->/g;
        let match: RegExpExecArray | null;

        while ((match = youtuberBlockRegex.exec(managedContent)) !== null) {
            const yId = match[1];
            const blockContent = match[2];
            const uuidsInBlock: string[] = [];

            const lines = blockContent.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (UUID_REGEX.test(trimmed)) {
                    const canonical = normalizeUuid(trimmed);
                    if (!uuidsInBlock.includes(canonical)) {
                        uuidsInBlock.push(canonical);
                    }
                    if (!allManagedUuids.includes(canonical)) {
                        allManagedUuids.push(canonical);
                    }
                }
            }
            managedUuidsByYoutuber[yId] = uuidsInBlock;
        }
    }

    return {
        rawContent,
        lineEnding,
        hasTrailingNewline,
        isManagedSectionPresent,
        hasMalformedMarkers,
        malformedReason,
        preManagedContent,
        postManagedContent,
        legacyUuids,
        managedUuidsByYoutuber,
        allManagedUuids
    };
}

/**
 * Renders the updated README content with desired managed groups.
 * Guarantees:
 * - Unmanaged section preserved byte-for-byte.
 * - If malformed markers exist, refuses to overwrite (returns error).
 * - No duplicate UUIDs in managed block.
 * - Omits UUIDs that already exist in legacy unmanaged section (reports them).
 * - Preserves line endings (\n or \r\n) and trailing newline.
 * - Detects no-op (changed === false).
 */
export function renderManagedReadme(
    existingContent: string,
    desiredGroups: RenderInputGroup[]
): RenderResult {
    const parsed = parseLegacyReadme(existingContent);

    if (parsed.hasMalformedMarkers) {
        return {
            content: existingContent,
            changed: false,
            writtenUuidCount: 0,
            skippedLegacyUuidCount: 0,
            skippedLegacyUuids: [],
            isMalformed: true,
            error: parsed.malformedReason || 'Bozuk marker yapısı tespit edildi (FAILED_MALFORMED_MARKERS).'
        };
    }

    const le = parsed.lineEnding;
    const legacySet = new Set(parsed.legacyUuids);
    const seenManagedUuids = new Set<string>();
    const skippedLegacyUuids: string[] = [];

    // Sort YouTuber groups alphabetically by display name
    const sortedGroups = [...desiredGroups].sort((a, b) =>
        a.youtuberName.localeCompare(b.youtuberName, 'tr', { sensitivity: 'base' })
    );

    const managedBlocks: string[] = [];
    let writtenUuidCount = 0;

    for (const group of sortedGroups) {
        // Canonicalize and deduplicate UUIDs for this group
        const groupUuids: string[] = [];
        for (const raw of group.uuids) {
            const canonical = normalizeUuid(raw);
            if (!canonical) continue;

            if (legacySet.has(canonical)) {
                if (!skippedLegacyUuids.includes(canonical)) {
                    skippedLegacyUuids.push(canonical);
                }
                continue; // Do NOT duplicate UUID already in legacy unmanaged section
            }

            if (!seenManagedUuids.has(canonical)) {
                seenManagedUuids.add(canonical);
                groupUuids.push(canonical);
            }
        }

        // Sort UUIDs inside group stably
        groupUuids.sort();

        if (groupUuids.length > 0) {
            writtenUuidCount += groupUuids.length;
            const lines: string[] = [
                `# BlumeCore: ${group.youtuberName}`,
                `<!-- BLUMECORE-YOUTUBER:${group.youtuberId}:START -->`,
                ...groupUuids,
                `<!-- BLUMECORE-YOUTUBER:${group.youtuberId}:END -->`
            ];
            managedBlocks.push(lines.join(le));
        }
    }

    // Build managed section
    let newManagedSection = '';
    if (managedBlocks.length > 0) {
        newManagedSection = `${MANAGED_START_MARKER}${le}${le}${managedBlocks.join(`${le}${le}`)}${le}${le}${MANAGED_END_MARKER}`;
    } else {
        newManagedSection = `${MANAGED_START_MARKER}${le}${MANAGED_END_MARKER}`;
    }

    let finalContent = '';
    if (parsed.isManagedSectionPresent) {
        // Ensure proper boundary line endings
        let pre = parsed.preManagedContent;
        let post = parsed.postManagedContent;

        // Clean up excessive trailing/leading newlines between markers
        pre = pre.replace(/(\r?\n)+$/, '');
        post = post.replace(/^(\r?\n)+/, '');

        if (pre.length > 0) {
            finalContent = `${pre}${le}${le}${newManagedSection}`;
        } else {
            finalContent = newManagedSection;
        }

        if (post.length > 0) {
            finalContent = `${finalContent}${le}${le}${post}`;
        }
    } else {
        // Appending to README
        const trimmedExisting = existingContent.replace(/(\r?\n)+$/, '');
        if (trimmedExisting.length > 0) {
            finalContent = `${trimmedExisting}${le}${le}${newManagedSection}`;
        } else {
            finalContent = newManagedSection;
        }
    }

    // Ensure trailing newline
    if (parsed.hasTrailingNewline && !finalContent.endsWith(le)) {
        finalContent += le;
    } else if (!finalContent.endsWith(le)) {
        // Standardize file ending with newline
        finalContent += le;
    }

    const changed = finalContent !== existingContent;

    return {
        content: finalContent,
        changed,
        writtenUuidCount,
        skippedLegacyUuidCount: skippedLegacyUuids.length,
        skippedLegacyUuids,
        isMalformed: false
    };
}
