# BlumeCore — Proje haritası

İlk kaynak kod incelemesi: **2026-10-03**. Bu belge mevcut kodun yol haritasıdır; canlı ortamın doğrulandığı anlamına gelmez. Sonraki değişikliklerin kapsamı ve doğrulaması [geliştirme kaydında](DEVELOPMENT_LOG.md) tutulur. Çalışma kuralları: [AGENTS.md](../AGENTS.md).

## 1. Projenin amacı ve teknik yapı

BlumeCore, tek sahibinin YouTuber ilişkilerini, takip süreçlerini, video atamalarını, gelir/giderlerini, ekibini ve Minecraft mod erişimlerini yönettiği özel bir yönetim uygulamasıdır. Minecraft oyuncu UUID'leri, izin verilen modların GitHub depolarındaki README allowlist içeriğine senkronize edilir.

- Next.js App Router **16.1.6**, React **19.2.3**, TypeScript strict; sürümler için asıl kaynak `package.json` ve `package-lock.json`.
- Firebase Authentication + Firestore; tarayıcı için `src/lib/firebase.ts`, sunucu için `src/lib/firebase-admin.ts`.
- CSS Modules ve `src/app/globals.css`; Lucide ikonları, date-fns tarih işlemleri, dnd-kit sürükleme/sıralama.
- Ayrı backend uygulaması yok; sunucu uçları `src/app/api` altındaki Next.js route handler'larıdır.
- GitHub REST istemcisi `src/lib/github/client.ts`; kalıcı senkronizasyon kuyruğu Firestore'dadır. `vercel.json`, `/api/cron/github-sync` için `0 3 * * *` zamanlamasını içerir.
- `next.config.ts` React Compiler'ı açar. `tsconfig.json` içindeki `@/*` alias'ı `src/*` ile eşleşir.

## 2. Kullanıcı bir bölümden söz ettiğinde nereden başlanır?

Tablodaki yollar depo köküne göredir. Sayfa klasörlerindeki `*.module.css` dosyaları aynı ekranın stilleridir. İlgili satırdan başla, ardından import ve çağrıları takip et.

| Kullanıcının sözünü ettiği alan | İlk okunacak dosyalar | Bağlantılı kod / veri |
| --- | --- | --- |
| Giriş, oturum, yetkisiz erişim, giriş döngüsü | `src/app/login/page.tsx`, `src/app/api/auth/session/route.ts` | `src/lib/server-auth.ts`, `src/lib/api-client.ts`, `src/lib/auth-context.tsx`, `src/app/(protected)/layout.tsx` |
| Ana sayfa, Follow Ups, takip, notlar, aşamalar | `src/app/(protected)/home/page.tsx`, `src/components/StatusesModal.tsx` | `src/lib/statuses.ts`; `followups`, `statuses`, `youtubers`, `groups` |
| Bekleyen ödeme, tahsilat | `src/components/PendingPaymentsModal.tsx`, `src/components/PendingPaymentsModal.module.css` | Ana sayfadan açılır; `pendingPayments`, `youtubers`; gruplama ve sabit YouTuber sırası `src/lib/pending-payments.ts` içindedir; toplu silme iki onay ister; dar ekran grup başlığı iki satırlıdır |
| YouTuber listesi, katalog, ülke/grup, kanal | `src/app/(protected)/catalog/page.tsx`, `src/components/GroupModal.tsx` | `youtubers`, `groups`; silme: `src/app/api/youtubers/[youtuberId]/route.ts` |
| YouTuber detayındaki takvim ve oyuncular | `src/components/CalendarModal.tsx`, `src/components/MinecraftPlayersTab.tsx` | `assignments`, `records`, `youtube_videos`; oyuncu API'leri |
| Takvim, video atama, gelir/gider, kayıt düzenleme | `src/app/(protected)/calendar/page.tsx`, `src/components/RecordModal.tsx` | `records`, `assignments`, `team`, `youtube_videos`; gelir/gider toplamlarının görünürlüğü `src/lib/income-visibility.ts`; atama silme API'si |
| Ekip, aracı, broker, komisyon | `src/app/(protected)/team/page.tsx`, `src/components/BrokerModal.tsx` | `team` içindeki `member` / `broker` rolleri; `records`, `assignments` |
| Video listesi, video kartı, sıralama | `src/app/(protected)/videos/page.tsx`, `src/components/VideoGridItem.tsx` | `youtube_videos`, `assignments`; video silme API'si |
| Video detayı, videoya mod bağlama, YouTuber erişimi | `src/components/VideoDetailModal.tsx`, `src/components/YoutuberModAccessModal.tsx` | `src/app/api/videos/[videoId]/mods/route.ts`, `src/app/api/mods/[modId]/access/route.ts` |
| Modlar sekmesi, mod ekleme/düzenleme | `src/app/(protected)/videos/page.tsx`, `src/components/ModModal.tsx` | `src/app/api/mods/route.ts`, `src/app/api/mods/[modId]/route.ts`, `src/lib/mods/types.ts` |
| GitHub bağlantı testi, depo oluşturma | `src/components/ModModal.tsx` | `src/app/api/mods/test-connection/route.ts`, `src/app/api/mods/provision-repository/route.ts`, `src/lib/github/client.ts` |
| Mod detayı, README kontrolü, legacy UUID, senkronizasyon | `src/components/ModDetailModal.tsx` | `src/app/api/mods/[modId]` altındaki uçlar; `src/lib/mods/mod-service.ts`, `src/lib/github/readme-parser.ts` |
| Minecraft oyuncusu, UUID, birincil oyuncu, aktif/pasif | `src/components/MinecraftPlayersTab.tsx`, `src/lib/minecraft-players.ts` | `src/app/api/youtubers/[youtuberId]/minecraft-players` altındaki uçlar; `syncActiveModsForYoutuberChange` |
| Global Blume, tüm modlara UUID ekleme | `src/lib/global-players.ts`, `src/app/api/mods/global-backfill/route.ts` | `REQUIRED_GLOBAL_PLAYERS`, `getGlobalMinecraftPlayersAdmin`, `buildDesiredUuidState` |
| Erişim verme/kaldırma, atama sonrası mod izni | `src/app/api/mods/[modId]/access/route.ts`, `src/app/api/videos/[videoId]/assign-access/route.ts` | `handleVideoAssignmentModAccess`, `recalculateCascadeAccess`, `grantSources`, `manualDecision` |
| Mod arşivleme, geri getirme, kalıcı silme, eski kayıt temizleme | `src/lib/mods/mod-service.ts` | `archiveModProject`, `restoreModProject`, `deleteModProject`, `previewArchivedModsCleanup`, `executeArchivedModsCleanup` |
| Bekleyen/başarısız senkronizasyon, retry, cron | `src/lib/mods/mod-service.ts`, `src/app/api/jobs` | `createOrCoalesceSyncJob`, `processSyncJob`, `processPendingJobs`; `src/app/api/cron/github-sync/route.ts` |
| Ayarlar, çıkış | `src/app/(protected)/settings/page.tsx` | Takvim gelir/gider toplamlarının kalıcı görünürlük ayarı (`user_settings`), Firebase sign-out + `DELETE /api/auth/session` |
| Alt menü, ortak görünüm, tema | `src/components/BottomNav.tsx`, `src/components/ClientLayout.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | `src/components/BottomNav.module.css`; sayfa/bileşen CSS Modules dosyaları, modallardaki satır içi stiller ve aşama renkleri için `src/lib/statuses.ts` |

`src/app/page.tsx`, `/home` adresine yönlendirir. Korumalı URL'ler `/home`, `/videos`, `/calendar`, `/catalog`, `/team`, `/settings` şeklindedir; `(protected)` yalnızca dosya sistemindeki route grubudur.

### Görsel tema

Arayüz açık temayı kullanır (`src/app/globals.css` içinde `color-scheme: light`). Ortak renk rolleri CSS değişkenleriyle tanımlıdır: açık gri zemin `--bg-color` (`#F4F7F5`), beyaz kart `--bg-card`, koyu metin `--text-primary`, ikincil metin `--text-secondary`, yeşil ana eylem `--accent-primary` (`#28694B`) ve açık yeşil vurgu yüzeyi `--accent-primary-soft`. Hata, bilgi ve uyarı renkleri ayrı rollerdir. Sayfa/modalların CSS Modules dosyaları ile bazı TSX satır içi stillerinde bu tokenlar kullanılır; yalnızca `globals.css` değiştirilerek bütün ekranın rengi doğrulanmış sayılmaz.

Takip aşamalarının kayıtlı özel renkleri arka plan/kenarlık tonunu belirler; `getStatusStyle` açık yüzeyde okunabilirlik için aşama metnini ortak koyu metin rengine bağlar. Yeni aşama renkleri `StatusesModal` içindeki paletten seçilir. `src/app/page.module.css` yönlendirme sayfasınca kullanılmayan eski şablon stilidir; aktif tema kaynağı değildir.

## 3. Veri ve sunucu sınırları

Sayfaların önemli bir kısmı `onSnapshot` ile Firestore'dan canlı veri dinler ve bazı CRUD işlemlerini doğrudan tarayıcı SDK'sıyla yapar. Dolayısıyla her ekran değişikliği bir API değişikliği değildir. Mod senkronizasyonu, oyuncu yönetiminin API akışı ve ilişkili silmeler sunucu tarafında da iş kuralları uygular.

`src/lib/minecraft-players.ts` hem ortak tip/UUID doğrulama yardımcılarını hem istemci Firestore yardımcılarını içerir. Güncel `MinecraftPlayersTab` istekleri `authenticatedFetch` üzerinden API'lere gider; sadece eski istemci yardımcılarını düzenlemek bu ekranı değiştirmeyebilir.

| Firestore koleksiyonları | Rolü ve model kaynağı |
| --- | --- |
| `youtubers`, `groups` | YouTuber ve grupları; katalog/ana sayfa içindeki tipler ve sorgular |
| `followups`, `statuses` | Takip, not ve aşamalar; ana sayfa, `StatusesModal`, `src/lib/statuses.ts` |
| `pendingPayments` | Bekleyen ödemeler; `PendingPaymentsModal` |
| `user_settings` | Sahip UID'siyle anahtarlanan `showIncomeTotals` ayarı; mevcut alan adı korunur ve takvimdeki bu ay/genel gelir ile gider toplamları yalnızca değer `true` ise gösterilir |
| `team`, `records` | Ekip/aracı bilgileri ve gelir/gider kayıtları; ekip/takvim sayfaları, `RecordModal` |
| `youtube_videos`, `assignments` | Videolar ve YouTuber video atamaları; video/takvim sayfaları |
| `minecraft_players`, `youtuber_minecraft_players` | Ortak oyuncu kimliği ve YouTuber ile ilişkisi; `src/lib/minecraft-players.ts` ve oyuncu API'leri |
| `globalMinecraftPlayers` | Aktif global oyuncular; `src/lib/global-players.ts`; yerleşik gerekli oyuncularla birleştirilir |
| `mod_projects`, `video_mod_projects` | Mod yapılandırması ve video–mod bağlantıları; `src/lib/mods/types.ts` |
| `youtuber_mod_access`, `mod_access_events` | Erişim, kaynakları, manuel kararlar ve erişim olayları; `src/lib/mods/types.ts` |
| `github_sync_jobs`, `github_sync_runs` | Kalıcı işler ve çalışma sonuçları; `src/lib/mods/types.ts`, `src/lib/mods/mod-service.ts` |
| `audit_logs` | Oyuncu/depo/mod işlemlerinin denetim kaydı; `src/lib/audit-log.ts` |

Koleksiyon adlarında büyük/küçük harf önemlidir (`pendingPayments`, `globalMinecraftPlayers`). Tarih biçimleri tüm koleksiyonlarda aynı değildir: mod tipleri milisaniye sayıları kullanırken bazı istemci akışları Firestore Timestamp/Date dönüştürür. Değiştirdiğin alanın okuyan ve yazan tarafını birlikte incele. Sorgu değişikliklerinde `firestore.indexes.json` dosyasını kontrol et.

## 4. Kritik iş akışları

### Oturum ve tek sahip modeli

Giriş ekranı Firebase kimlik doğrulamasının ardından `src/app/api/auth/session/route.ts` üzerinden `__session` çerezi oluşturur. `src/app/(protected)/layout.tsx`, `verifySessionCookieOwner` ile sunucuda kontrol yapar. `src/lib/api-client.ts` içindeki `authenticatedFetch`, API isteklerine Firebase ID token ekler; 401 durumunda bir kez token yeniler. Oturum endpoint'i çıkış/yönlendirme döngüsüne girmemek için özel ele alınır.

`requireOwnerUser`, doğrulanmış UID'yi sunucu değişkeni `ADMIN_FIREBASE_UID` ile karşılaştırır; eksik yapılandırmada erişimi reddeder. Firestore ve Storage kuralları da sabit sahip UID'sine kilitlidir; yapılandırılan sahip, bu kurallar ve giriş ekranındaki `AUTHORIZED_OWNER_UID` birbiriyle uyumlu olmalıdır. `userId` alanlarının bulunması uygulamanın çok kiracılı olduğu anlamına gelmez. `ProtectedRoute.tsx` istemci yardımcı bileşenidir; asıl sayfa koruması sunucu layout'undadır.

### Mod oluşturma ve ilk senkronizasyon

`ModModal` → `/api/mods/test-connection` veya `/api/mods/provision-repository` → `/api/mods`.

- Mod ID, GitHub repo adı olarak kullanılır; `canonicalModKey` küçük harfle eşleştirmeyi sağlar. Owner sunucuda `GITHUB_ALLOWED_OWNER` üzerinden seçilir; allowlist yolu `README.md` olur. Başlangıç branch'i `main`, kayıt sırasında bulunursa deponun varsayılan branch'idir.
- Mevcut aktif mod sessizce üzerine yazılmaz. Eski arşiv kaydı varsa `STALE_ARCHIVED_RECORD` yanıtı ve temizleme akışı vardır.
- Depo oluşturma istemcisi public repo ve `auto_init` kullanır; dönen README doğrulanır. Mod ekleme ve repo oluşturma akışlarını ayrı ayrı incele.
- Normal mod oluşturma route'u, mod belgesini ve `INITIAL_SYNC` işini aynı Firestore transaction'ında oluşturur. `prepareSyncJobInTx` okumaları hazırlar, `applySyncJobInTx` yazma aşamasıdır.

### Video atama, erişim ve oyuncu değişiklikleri

`RecordModal` video atamasını `assignments` koleksiyonuna yazar; otomatik mod izni seçiliyse `/api/videos/[videoId]/assign-access`, `handleVideoAssignmentModAccess` çağırır. Video–mod bağlantıları `video_mod_projects` üzerinden bulunur.

Erişim modeli yalnızca tek bir boolean değildir: `status`, `manualDecision` (`NONE`, `FORCE_ALLOW`, `FORCE_DENY`) ve `grantSources` birlikte değerlendirilir. Manuel erişim endpoint'i ile otomatik atama/silme akışını birlikte oku; farklı video atamalarından gelen erişim kaynakları olabilir.

Oyuncu ekleme/düzenleme/silme route'ları `syncActiveModsForYoutuberChange` ile ilgili aktif modların senkronizasyonunu tetikler. UUID normalizasyonu, ortak oyuncu kaydı, YouTuber ilişkisi, aktiflik ve birincil oyuncu ayrımını koru. Normal ilişki silme, ortak `minecraft_players` kimliğinin silinmesiyle aynı şey değildir.

### GitHub README senkronizasyonu

`createOrCoalesceSyncJob` → `processSyncJob` → `buildDesiredUuidState` → `getRepositoryFile` → `renderManagedReadme` → gerekirse `updateRepositoryFile` → iş/çalışma sonucu kaydı.

- Beklenen UUID kümesi; global oyuncular, modun `manualProtectedUuids` listesi ve erişimi aktif YouTuber'ların aktif oyuncularından hesaplanır. Yerleşik Global Blume oyuncusu, `globalMinecraftPlayers` boş olsa da global oyuncu sağlayıcısından gelir.
- Normal renderer, `<!-- BLUMECORE-MANAGED-START -->` / `<!-- BLUMECORE-MANAGED-END -->` arasını yönetir. Legacy içerik korunur; legacy'de zaten olan UUID managed bölüme tekrar yazılmaz; bozuk/eksik/tekrarlı marker'lar hata üretir.
- İşler transaction ile alınır; bekleyen/çalışan işler birleştirilebilir. Durumlar `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `CANCELLED` olabilir. Sonuç kaydı ayrıca `NO_OP` veya `NO_ACTIVE_PLAYERS` olabilir; kesin tipler `src/lib/mods/types.ts` içindedir.
- İstek sonrası `after()` ile tetiklenen yollar ve cron vardır. Kuyruk kaydı oluşması GitHub commit'inin tamamlandığını göstermez; hata/retry davranışını koddan ve gerçek çalışmadan doğrula.
- `legacy-migration` endpoint'i normal sync'ten farklı olarak legacy UUID'leri sınıflandırıp taşıma işlemi yapar; varsayılanı önizlemedir (`preview !== false`). Yetki kaldırıldıktan sonra legacy UUID'nin kalması normal sync'in koruma davranışından kaynaklanabilir.

### Silme, arşivleme ve bağlı erişimlerin yeniden hesaplanması

- YouTuber, video ve assignment silmelerinin kendi sunucu route'ları vardır. `src/app/api/lifecycle/cascade-sync/route.ts` ve `recalculateCascadeAccess` ek yeniden hesaplama giriş noktalarıdır. İlgili route'u incelemeden tüm silmeleri tek fonksiyonun yönettiğini varsayma.
- `archiveModProject`: README managed bölümünü boşaltmayı dener; `ARCHIVING` → `ARCHIVED` veya `ARCHIVE_FAILED`. Legacy içerik normal renderer kurallarıyla korunur.
- `restoreModProject`: modu aktifleştirir ve beklenen güncel durumu senkronize etmeyi dener.
- `deleteModProject`: uygulamadaki mod kaydını, bağlantılarını, erişim/iş/çalışma kayıtlarını temizler; çalışan işleri `CANCELLED` olarak işaretler. GitHub reposuna veya README'ye silme/yazma isteği yapmaz.
- `/api/mods/cleanup-archived`: GET önizleme, POST temizleme (`confirm: true`) akışıdır.

## 5. API dizinlerini bulma

Route dosyalarında dışa aktarılan HTTP fonksiyonları gerçek sözleşmedir; istek/yanıt değişikliğinde çağıran bileşeni de oku.

| Dizin / route dosyası | Görevi |
| --- | --- |
| `src/app/api/auth/session/route.ts` | GET oturum kontrolü, POST oturum oluşturma, DELETE çıkış |
| `src/app/api/mods/route.ts`, `src/app/api/mods/[modId]/route.ts` | Liste/oluşturma ve tek mod okuma/güncelleme/silme |
| `src/app/api/mods/[modId]` | `access`, `sync`, `drift-check`, `legacy-uuids`, `legacy-migration`, `archive`, `restore` |
| `src/app/api/mods` | Ek uçlar: `test-connection`, `provision-repository`, `global-backfill`, `cleanup-archived` |
| `src/app/api/videos/[videoId]` | Video silme, `mods` bağlantıları, `assign-access` |
| `src/app/api/youtubers` | Liste, YouTuber silme; `minecraft-players`, `active-mods-count`, `sync-mods` |
| `src/app/api/assignments/[assignmentId]/route.ts` | Atama silme ve ilgili erişim güncellemeleri |
| `src/app/api/lifecycle/cascade-sync/route.ts` | Bağlı erişimleri yeniden hesaplama |
| `src/app/api/jobs` | `process` (sahip veya cron), `retry` (sahip) |
| `src/app/api/cron/github-sync/route.ts` | GET; yalnızca cron secret ile kuyruk işleme |
| `src/app/api/account/delete/route.ts`, `src/app/api/user/delete/route.ts` | Hesap silme devre dışı; tanımlı metotlar 405 döndürür |

## 6. Çalıştırma ve doğrulama

Komutları depo kökünde çalıştır. Bu tablonun varlığı kontrollerin geçmiş olduğu anlamına gelmez; çalıştırılan kontrollerin sonucu geliştirme kaydına yazılır.

| Komut | Amaç / sınır |
| --- | --- |
| `npm ci` | Lockfile'a göre bağımlılık kurulumu |
| `npm run dev` | Yerel Next.js geliştirme sunucusu |
| `npm run lint` | ESLint; mevcut config `tests` dizinini hariç tutar |
| `npx tsc --noEmit --incremental false` | Tip kontrolü; `.tsbuildinfo` yazmadan |
| `npm test` | `tsx --test tests/*.test.ts`; Node test runner |
| `node_modules/.bin/tsx --test tests/readme-sync.test.ts` | Tek hedefli test örneği; dosyayı ilgili testle değiştir |
| `npm run test:emulator` | Firestore kuralları ve transaction/outbox testleri; script macOS JDK 21 yoluna bağlıdır, Firebase CLI/Java gerekir |
| `npm run build` / `npm start` | Üretim derlemesi / derlemeyi çalıştırma; layout `next/font/google` ile font kullanır |

Emülatör testleri `127.0.0.1:8080` açık değilse atlanır. `npm test` sonucundaki atlamaları gerçek Firestore doğrulaması olarak raporlama. Bazı domain/kuyruk/UI testleri davranışın bellek içi simülasyonunu yapar; bütün route handler'larını veya gerçek React ekranını çalıştırmaz. UI değişikliği ilgili ekran üzerinden de kontrol edilmelidir.

| Değişen alan | İlgili test dosyaları (`tests` altında) |
| --- | --- |
| Oturum / sahip kontrolü | `single-owner-auth.test.ts`, `protected-layout.test.ts` |
| Minecraft doğrulama / oyuncu değişikliği | `minecraft-players.test.ts`, `player-sync-propagation.test.ts` |
| Erişim / ilişkili yaşam döngüsü | `mod-domain-access.test.ts`, `mod-lifecycle-propagation.test.ts` |
| README parse/render | `readme-sync.test.ts` |
| GitHub istemcisi / repo oluşturma | `github-client.test.ts`, `repo-provisioning.test.ts` |
| Kuyruk / Global Blume / ilk sync | `sync-job-queue.test.ts`, `global-blume-initial-sync.test.ts` |
| Kalıcı silme / arşiv temizleme | `mod-delete-and-cleanup.test.ts` |
| UI olayları / yanlışlıkla backfill tetikleme | `ui-event-regression.test.ts` (simülasyon) |
| Beklenen ödeme grubu sırası / tekil silme | `pending-payments.test.ts` (gruplama fonksiyonu) |
| Gerçek Firestore kuralları / transaction | `emulator-firestore-rules-and-outbox.test.ts` |

Yalnızca belge değiştiğinde kaynak yolları, bağlantılar ve `git diff --check` kontrolü yeterlidir. Kod değişikliğinde ilgili testleri, lint/tip kontrolünü; derleme, UI veya emülatör kontrolünü de değişikliğin etkisine göre seç.

## 7. Yapılandırma ve mevcut belgeler

Değerleri buraya kopyalama. Kaynak kodun kullandığı değişkenler:

- Tarayıcı Firebase: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- Sunucu Firebase: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`; project ID için kodda `NEXT_PUBLIC_FIREBASE_PROJECT_ID` / `FIREBASE_PROJECT_ID` fallback'leri de vardır.
- Sahip ve görev doğrulaması: `ADMIN_FIREBASE_UID`, `CRON_SECRET`.
- GitHub: `GITHUB_TOKEN`, `GITHUB_ALLOWED_OWNER`, `GITHUB_API_VERSION`; varsayılanlar `src/lib/github/client.ts` içindedir.
- `MOCK_AUTH` ve `NODE_ENV === 'test'` test doğrulama yollarını açar; üretim kurulumunun parçası değildir.

`firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` Firebase yapılandırmasını; `vercel.json` cron tanımını tutar. Yerel `.env*`, `.vercel`, `.next`, `node_modules`, loglar ve derleme çıktıları proje hafızasının kaynağı değildir.

- [README](../README.md): geliştirme başlangıcı ve production deployment kontrol listesi.
- [GitHub mod sync kurulumu](github-mod-sync-setup.md): operasyonel kurulum; ilk sürümdeki form/izin anlatımını güncel route'larla karşılaştır.
- [Mod sync migration](migrations/github-mod-sync-migration.md) ve [oyuncu migration](migrations/minecraft-players-migration.md): ilk şema eklemelerinin tarihsel bağlamı; güncel model için kod/tipleri kullan.

## 8. Bilinen sınırlamalar ve yeniden incelenecek noktalar

İlk kaynak incelemesinde görülen ve henüz çözümlenmemiş noktalar:

- Migration belgelerindeki çok kiracılı güvenlik anlatımı mevcut tek sahip kurallarıyla uyuşmaz. Eski mod şeması yeni `lifecycleStatus`, `grantSources` ve iptal edilen işler gibi alanları tam kapsamaz.
- GitHub kurulum rehberindeki elle owner/repo/branch girme anlatımı güncel mod oluşturma route'uyla aynı değildir. Repo oluşturma istemcisindeki izin açıklaması `Administration` iznini de içerir; salt README güncellemesiyle repo oluşturma gereksinimlerini karıştırma.
- `processPendingJobs`, tekrar zamanı gelen `FAILED` işleri `processSyncJob` fonksiyonuna iletir; `processSyncJob` iş alma aşaması yalnızca `PENDING` veya süresi geçmiş `RUNNING` kabul eder. Otomatik başarısız iş retry akışını çalışıyor varsayma; ilgili görevde doğrula.
- Tiplerde yaşam döngüsü için `resolveModLifecycleStatus` vardır, ancak bazı sync yolları hâlâ `isActive` / `isArchived` alanlarını doğrudan okur. Yaşam döngüsü değişikliğinde eski/yeni alanları kullanan çağıranları birlikte kontrol et.

Bu maddeler çözüldüğünde ilgili açıklamayı güncelle/kaldır, çözümü ve doğrulamayı geliştirme kaydına yaz. Yeni gözlemi doğrulanmış hata, çıkarım veya henüz doğrulanmamış şüphe olarak açıkça nitele.
