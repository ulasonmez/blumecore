import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLegacyReadme,
    renderManagedReadme,
    MANAGED_START_MARKER,
    MANAGED_END_MARKER,
    RenderInputGroup
} from '../src/lib/github/readme-parser';
import { normalizeUuid } from '../src/lib/minecraft-players';

describe('Legacy README Parser & Managed Renderer Tests', () => {

    describe('Legacy README Parsing', () => {
        it('should correctly parse README without managed section and extract legacy UUIDs', () => {
            const rawReadme = `# OpenAnyBlock\n#Bl\n058aa284-c0cf-4826-beae-9df1cb411623\n#Par\n8f407f29-695d-469c-9be7-68b98acc9007\n`;
            const parsed = parseLegacyReadme(rawReadme);

            assert.equal(parsed.isManagedSectionPresent, false);
            assert.equal(parsed.hasMalformedMarkers, false);
            assert.equal(parsed.legacyUuids.length, 2);
            assert.deepEqual(parsed.legacyUuids, [
                '058aa284-c0cf-4826-beae-9df1cb411623',
                '8f407f29-695d-469c-9be7-68b98acc9007'
            ]);
            assert.equal(parsed.lineEnding, '\n');
            assert.equal(parsed.hasTrailingNewline, true);
        });

        it('should detect CRLF line endings in Windows-formatted README', () => {
            const crlfReadme = `# Title\r\n058aa284-c0cf-4826-beae-9df1cb411623\r\n`;
            const parsed = parseLegacyReadme(crlfReadme);

            assert.equal(parsed.lineEnding, '\r\n');
            assert.equal(parsed.legacyUuids.length, 1);
        });

        it('should detect file without trailing newline', () => {
            const noTrailingReadme = `# Title\n058aa284-c0cf-4826-beae-9df1cb411623`;
            const parsed = parseLegacyReadme(noTrailingReadme);

            assert.equal(parsed.hasTrailingNewline, false);
            assert.equal(parsed.legacyUuids.length, 1);
        });

        it('should parse valid managed section and extract managed UUIDs by YouTuber', () => {
            const managedReadme = `# Header\n058aa284-c0cf-4826-beae-9df1cb411623\n\n${MANAGED_START_MARKER}\n\n# BlumeCore: Wollech\n<!-- BLUMECORE-YOUTUBER:yt-1:START -->\n704731ad-d3e2-4d34-af7e-d33937fc97db\nd71faf5d-dd31-4499-9f2f-88c2b26ae053\n<!-- BLUMECORE-YOUTUBER:yt-1:END -->\n\n${MANAGED_END_MARKER}\n`;
            const parsed = parseLegacyReadme(managedReadme);

            assert.equal(parsed.isManagedSectionPresent, true);
            assert.equal(parsed.hasMalformedMarkers, false);
            assert.equal(parsed.legacyUuids.length, 1);
            assert.equal(parsed.legacyUuids[0], '058aa284-c0cf-4826-beae-9df1cb411623');
            assert.equal(parsed.allManagedUuids.length, 2);
            assert.deepEqual(parsed.managedUuidsByYoutuber['yt-1'], [
                '704731ad-d3e2-4d34-af7e-d33937fc97db',
                'd71faf5d-dd31-4499-9f2f-88c2b26ae053'
            ]);
        });

        it('should detect malformed marker when START marker exists without END marker', () => {
            const malformed = `# Header\n${MANAGED_START_MARKER}\nSome content without end tag\n`;
            const parsed = parseLegacyReadme(malformed);

            assert.equal(parsed.hasMalformedMarkers, true);
            assert.equal(parsed.isManagedSectionPresent, false);
            assert.match(parsed.malformedReason || '', /BLUMECORE-MANAGED-END bulunamadı/);
        });

        it('should detect malformed marker when END marker exists without START marker', () => {
            const malformed = `# Header\nSome content\n${MANAGED_END_MARKER}\n`;
            const parsed = parseLegacyReadme(malformed);

            assert.equal(parsed.hasMalformedMarkers, true);
            assert.equal(parsed.isManagedSectionPresent, false);
            assert.match(parsed.malformedReason || '', /BLUMECORE-MANAGED-START bulunamadı/);
        });

        it('should detect malformed marker when multiple START markers exist', () => {
            const malformed = `# Header\n${MANAGED_START_MARKER}\nPart 1\n${MANAGED_START_MARKER}\nPart 2\n${MANAGED_END_MARKER}\n`;
            const parsed = parseLegacyReadme(malformed);

            assert.equal(parsed.hasMalformedMarkers, true);
            assert.match(parsed.malformedReason || '', /birden fazla/);
        });

        it('should detect malformed marker when multiple END markers exist', () => {
            const malformed = `# Header\n${MANAGED_START_MARKER}\nPart 1\n${MANAGED_END_MARKER}\n${MANAGED_END_MARKER}\n`;
            const parsed = parseLegacyReadme(malformed);

            assert.equal(parsed.hasMalformedMarkers, true);
            assert.match(parsed.malformedReason || '', /birden fazla/);
        });

        it('should detect malformed marker when END marker appears before START marker', () => {
            const malformed = `# Header\n${MANAGED_END_MARKER}\n${MANAGED_START_MARKER}\n`;
            const parsed = parseLegacyReadme(malformed);

            assert.equal(parsed.hasMalformedMarkers, true);
            assert.match(parsed.malformedReason || '', /START işaretinden önce/);
        });
    });

    describe('Managed README Rendering & Safety Safeguards', () => {
        const initialReadme = `# OpenAnyBlock\n#Bl\n058aa284-c0cf-4826-beae-9df1cb411623\n#Par\n8f407f29-695d-469c-9be7-68b98acc9007\n`;

        it('should safely append managed section to README without managed section, preserving unmanaged lines', () => {
            const groups: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-wollech',
                    youtuberName: 'Wollech',
                    uuids: ['704731ad-d3e2-4d34-af7e-d33937fc97db', 'd71faf5d-dd31-4499-9f2f-88c2b26ae053']
                }
            ];

            const res = renderManagedReadme(initialReadme, groups);
            assert.equal(res.changed, true);
            assert.equal(res.isMalformed, false);
            assert.equal(res.writtenUuidCount, 2);
            assert.equal(res.skippedLegacyUuidCount, 0);

            // Unmanaged content is intact at the beginning
            assert.ok(res.content.startsWith(initialReadme.trim()));
            assert.ok(res.content.includes(MANAGED_START_MARKER));
            assert.ok(res.content.includes(MANAGED_END_MARKER));
            assert.ok(res.content.includes('# BlumeCore: Wollech'));
            assert.ok(res.content.includes('704731ad-d3e2-4d34-af7e-d33937fc97db'));
            assert.ok(res.content.includes('d71faf5d-dd31-4499-9f2f-88c2b26ae053'));
        });

        it('should detect no-op when rendered content matches existing content exactly', () => {
            const groups: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-wollech',
                    youtuberName: 'Wollech',
                    uuids: ['704731ad-d3e2-4d34-af7e-d33937fc97db']
                }
            ];

            const firstRun = renderManagedReadme(initialReadme, groups);
            assert.equal(firstRun.changed, true);

            // Second run with same input
            const secondRun = renderManagedReadme(firstRun.content, groups);
            assert.equal(secondRun.changed, false);
            assert.equal(secondRun.content, firstRun.content);
        });

        it('should refuse to overwrite files with malformed markers (safety rule)', () => {
            const malformed = `# OpenAnyBlock\n${MANAGED_START_MARKER}\nIncomplete markers`;
            const groups: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-wollech',
                    youtuberName: 'Wollech',
                    uuids: ['704731ad-d3e2-4d34-af7e-d33937fc97db']
                }
            ];

            const res = renderManagedReadme(malformed, groups);
            assert.equal(res.isMalformed, true);
            assert.equal(res.changed, false);
            assert.equal(res.content, malformed); // Preserved byte-for-byte without corruption
            assert.ok(res.error?.includes('BLUMECORE-MANAGED-END'));
        });

        it('should NOT duplicate UUIDs already present in unmanaged legacy section (legacy conflict protection)', () => {
            const legacyUuid = '058aa284-c0cf-4826-beae-9df1cb411623';
            const newUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

            const groups: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-1',
                    youtuberName: 'Test YouTuber',
                    uuids: [legacyUuid, newUuid]
                }
            ];

            const res = renderManagedReadme(initialReadme, groups);
            assert.equal(res.writtenUuidCount, 1); // Only newUuid written
            assert.equal(res.skippedLegacyUuidCount, 1);
            assert.deepEqual(res.skippedLegacyUuids, [legacyUuid]);

            // Managed section contains newUuid, but NOT the legacyUuid
            const parsedResult = parseLegacyReadme(res.content);
            assert.equal(parsedResult.allManagedUuids.includes(newUuid), true);
            assert.equal(parsedResult.allManagedUuids.includes(legacyUuid), false);
        });

        it('should write canonical lowercase UUIDs and sort groups and UUIDs stably', () => {
            const groups: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-z',
                    youtuberName: 'Zebra Gamer',
                    uuids: ['B2B2B2B2-B2B2-B2B2-B2B2-B2B2B2B2B2B2', 'A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1']
                },
                {
                    youtuberId: 'yt-a',
                    youtuberName: 'Alpha YouTuber',
                    uuids: ['C3C3C3C3-C3C3-C3C3-C3C3-C3C3C3C3C3C3']
                }
            ];

            const res = renderManagedReadme(initialReadme, groups);
            const content = res.content;

            // Group 'Alpha YouTuber' should appear before 'Zebra Gamer'
            const alphaIdx = content.indexOf('# BlumeCore: Alpha YouTuber');
            const zebraIdx = content.indexOf('# BlumeCore: Zebra Gamer');
            assert.ok(alphaIdx < zebraIdx);

            // Inside Zebra Gamer, A1... should appear before B2... and be lowercase
            const a1Idx = content.indexOf('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1');
            const b2Idx = content.indexOf('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2');
            assert.ok(a1Idx < b2Idx);
            assert.equal(content.includes('A1A1A1A1'), false); // Canonical lowercase verified
        });

        it('should correctly remove revoked YouTubers from the managed section when updated', () => {
            const groupsBefore: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-keep',
                    youtuberName: 'Keep YouTuber',
                    uuids: ['11111111-1111-1111-1111-111111111111']
                },
                {
                    youtuberId: 'yt-revoke',
                    youtuberName: 'Revoke YouTuber',
                    uuids: ['22222222-2222-2222-2222-222222222222']
                }
            ];

            const step1 = renderManagedReadme(initialReadme, groupsBefore);
            assert.ok(step1.content.includes('Revoke YouTuber'));
            assert.ok(step1.content.includes('22222222-2222-2222-2222-222222222222'));

            // Step 2: Revoked YouTuber excluded from desired groups
            const groupsAfter: RenderInputGroup[] = [
                {
                    youtuberId: 'yt-keep',
                    youtuberName: 'Keep YouTuber',
                    uuids: ['11111111-1111-1111-1111-111111111111']
                }
            ];

            const step2 = renderManagedReadme(step1.content, groupsAfter);
            assert.equal(step2.changed, true);
            assert.equal(step2.content.includes('Revoke YouTuber'), false);
            assert.equal(step2.content.includes('22222222-2222-2222-2222-222222222222'), false);
            assert.ok(step2.content.includes('Keep YouTuber'));
            assert.ok(step2.content.includes('11111111-1111-1111-1111-111111111111'));
        });
    });
});
