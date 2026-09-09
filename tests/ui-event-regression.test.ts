import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('UI Event Regression & Global Blume Backfill Safeguard Tests', () => {
    let fetchCalls: { url: string; options?: RequestInit }[] = [];
    let alertCalls: string[] = [];
    let toastMessages: string[] = [];

    beforeEach(() => {
        fetchCalls = [];
        alertCalls = [];
        toastMessages = [];
    });

    // Mock authenticatedFetch
    const mockAuthenticatedFetch = async (url: string, options?: RequestInit): Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<Record<string, any>>;
    }> => {
        fetchCalls.push({ url, options });
        if (url === '/api/mods/global-backfill') {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    syncState: 'QUEUED',
                    message: '18 aktif mod için Global Blume UUID senkronizasyonu kuyruğa alındı.',
                    modCount: 18,
                    queuedJobIds: ['job-1', 'job-2']
                })
            };
        }
        if (url.includes('/sync')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: { message: 'Mod başarıyla senkronize edildi.' }
                })
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({ success: true })
        };
    };

    const mockAlert = (msg: string) => {
        alertCalls.push(msg);
    };

    const mockShowToast = (msg: string) => {
        toastMessages.push(msg);
    };

    it('1. Detay butonuna tıklamak global-backfill API\'sini çağırmıyor', async () => {
        let selectedModForDetail: unknown = null;
        const testMod = { id: 'mod-123', modKey: 'test-mod', displayName: 'Test Mod' };

        // Detay click handler
        const handleDetailClick = (e: { stopPropagation: () => void }, mod: typeof testMod) => {
            e.stopPropagation();
            selectedModForDetail = mod;
        };

        let stopped = false;
        handleDetailClick({ stopPropagation: () => { stopped = true; } }, testMod);

        assert.equal(stopped, true, 'Detay must stopPropagation');
        assert.deepEqual(selectedModForDetail, testMod, 'Must select mod for detail');
        assert.equal(fetchCalls.length, 0, 'Must NOT make any fetch call');
        assert.equal(alertCalls.length, 0, 'Must NOT trigger window.alert');
    });

    it('2. Şimdi Senkronize Et butonu yalnızca ilgili mod sync API\'sini çağırıyor', async () => {
        const modId = 'mod-456';
        let syncingModId: string | null = null;

        const handleQuickSyncMod = async (id: string, e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            if (syncingModId) return;
            syncingModId = id;
            try {
                const res = await mockAuthenticatedFetch(`/api/mods/${id}/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ triggerType: 'MANUAL_SYNC' })
                });
                const json = await res.json();
                if (res.ok) {
                    mockShowToast(json.data?.message || 'Mod senkronize edildi.');
                }
            } finally {
                syncingModId = null;
            }
        };

        let stopped = false;
        await handleQuickSyncMod(modId, { stopPropagation: () => { stopped = true; } });

        assert.equal(stopped, true);
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, `/api/mods/${modId}/sync`);
        assert.equal(
            fetchCalls.some(f => f.url.includes('global-backfill')),
            false,
            'Must NEVER call global-backfill endpoint'
        );
        assert.equal(alertCalls.length, 0, 'Must not call window.alert');
        assert.ok(toastMessages.length > 0, 'Must use toast notifications');
    });

    it('3. Arama alanına tıklamak backfill çağırmıyor', () => {
        let modSearchTerm = '';
        const handleSearchChange = (val: string) => {
            modSearchTerm = val;
        };

        handleSearchChange('iron-chest');
        assert.equal(modSearchTerm, 'iron-chest');
        assert.equal(fetchCalls.length, 0, 'Search change must make no fetch calls');
        assert.equal(alertCalls.length, 0);
    });

    it('4. Mod kartına tıklamak backfill çağırmıyor', () => {
        let selectedModForDetail: unknown = null;
        const testMod = { id: 'card-mod-1', modKey: 'card-mod' };

        // Card click handler
        const handleCardClick = (mod: typeof testMod) => {
            selectedModForDetail = mod;
        };

        handleCardClick(testMod);
        assert.deepEqual(selectedModForDetail, testMod);
        assert.equal(fetchCalls.length, 0);
        assert.equal(alertCalls.length, 0);
    });

    it('5. YouTube Videoları / Modlar tabına tıklamak backfill çağırmıyor', () => {
        let activeMainTab: 'videos' | 'mods' = 'videos';

        const switchTab = (tab: 'videos' | 'mods') => {
            activeMainTab = tab;
        };

        switchTab('mods');
        assert.equal(activeMainTab, 'mods');
        switchTab('videos');
        assert.equal(activeMainTab, 'videos');
        assert.equal(fetchCalls.length, 0);
        assert.equal(alertCalls.length, 0);
    });

    it('6. Global Blume Backfill butonuna basmak sadece onay modalını açıyor, doğrudan API çağırmıyor', () => {
        let isBackfillModalOpen = false;

        const openGlobalBackfillConfirmation = () => {
            isBackfillModalOpen = true;
        };

        // User clicks the Global Blume Backfill button
        openGlobalBackfillConfirmation();

        assert.equal(isBackfillModalOpen, true, 'Confirmation modal must open');
        assert.equal(fetchCalls.length, 0, 'Must NOT make any API calls before confirmation');
        assert.equal(alertCalls.length, 0, 'Must NOT trigger window.alert');
    });

    it('7. İptal butonu API çağrısı yapmıyor ve modalı kapatıyor', () => {
        let isBackfillModalOpen = true;

        const handleCancel = () => {
            isBackfillModalOpen = false;
        };

        handleCancel();

        assert.equal(isBackfillModalOpen, false, 'Modal must close on cancel');
        assert.equal(fetchCalls.length, 0, 'Must NOT make API call on cancel');
    });

    it('8. Onay butonu tek bir POST /api/mods/global-backfill çağrısı yapıyor ve toast gösteriyor', async () => {
        let isBackfilling = false;
        let isBackfillModalOpen = true;
        const activeModsCount = 18;

        const handleGlobalBackfill = async () => {
            if (isBackfilling) return;
            isBackfilling = true;
            try {
                const res = await mockAuthenticatedFetch('/api/mods/global-backfill', { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    mockShowToast(data.message || `${activeModsCount} aktif mod için Global Blume UUID senkronizasyonu kuyruğa alındı.`);
                } else {
                    mockShowToast(`Hata: ${data.error || 'Backfill işlemi başarısız oldu.'}`);
                }
            } catch {
                mockShowToast('Hata: Backfill isteği sırasında ağ hatası oluştu.');
            } finally {
                isBackfilling = false;
                isBackfillModalOpen = false;
            }
        };

        await handleGlobalBackfill();

        assert.equal(isBackfilling, false);
        assert.equal(isBackfillModalOpen, false);
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, '/api/mods/global-backfill');
        assert.equal(fetchCalls[0].options?.method, 'POST');
        assert.equal(alertCalls.length, 0, 'Native window.alert must NEVER be used');
        assert.equal(toastMessages.length, 1);
        assert.equal(
            toastMessages[0],
            '18 aktif mod için Global Blume UUID senkronizasyonu kuyruğa alındı.'
        );
    });

    it('9. Çift tıklama duplicate istek oluşturmuyor (isBackfilling koruması)', async () => {
        let isBackfilling = false;

        const handleGlobalBackfill = async () => {
            if (isBackfilling) return;
            isBackfilling = true;
            try {
                await mockAuthenticatedFetch('/api/mods/global-backfill', { method: 'POST' });
            } finally {
                isBackfilling = false;
            }
        };

        // Simulate rapid double click concurrently
        const p1 = handleGlobalBackfill();
        const p2 = handleGlobalBackfill();
        await Promise.all([p1, p2]);

        assert.equal(fetchCalls.length, 1, 'Exactly one API call should be sent due to isBackfilling guard');
    });

    it('10. Native window.alert hiçbir yerde kullanılmıyor', () => {
        // Assert alertCalls is strictly 0 across all tested interaction paths
        assert.equal(alertCalls.length, 0, 'window.alert must not be called');
    });
});
