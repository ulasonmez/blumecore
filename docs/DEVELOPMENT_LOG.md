# BlumeCore — Geliştirme kaydı

Yeni sohbetlerde önce [AGENTS.md](../AGENTS.md) ve [proje haritasını](PROJECT_MAP.md), sonra bu dosyanın başındaki son kayıtları oku. En yeni kayıt en üstte olmalıdır. Bu günlük Git geçmişinin veya güncel mimari haritasının yerine geçmez.

Her görev için kısa kayıt tut: ne/neden değişti, ilgili dosyalar, gerçekten yapılan doğrulama ve varsa kalan iş. Kod/konfigürasyon değiştiğinde haritayı kontrol et; etkilenen bilgiyi haritada da yerinde güncelle. Secret, kişisel veri veya tam araç çıktısı ekleme. Salt okunur soru/yanıtları kaydetme.

## 2026-11-26 — Aracı detayında video ödeme durumu ve ödemelerin videoları

- **Değişiklik ve neden:** Team sayfasında aracıya tıklanınca açılan `BrokerModal`'da da YouTuber detayındaki gibi ödeme takibi istendi. Videolar sekmesindeki her atamaya “Ödendi / Kısmi ödendi / Ödenmedi” rozeti ve üstte durum sayıları eklendi; Para sekmesindeki gelir kayıtlarında ödemenin bağlı olduğu videolar (tam/kısmi) gösteriliyor. Ödemede aracı seçilmemiş olabileceği için modal artık sahibin tüm `records`/`assignments` belgelerini dinleyip aracıya ait olanları istemcide `brokerId` ile süzüyor; durum, atamanın YouTuber'ının tüm gelir kayıtlarından hesaplanır. YouTuber bazında harita kurma `payment-links.ts` içine `buildPaymentMapsByYoutuber` / `getYoutuberVideoPaymentStatus` olarak alındı ve `unpaid-videos.ts` bunu kullanacak şekilde sadeleştirildi (davranış aynı).
- **Dosyalar:** `src/components/BrokerModal.tsx`, `src/lib/payment-links.ts`, `src/lib/unpaid-videos.ts`, `tests/payment-links.test.ts`; harita: giriş tablosu, aracı detayı paragrafı ve “Ödemeye video bağlama ve ödeme durumu” bölümü güncellendi.
- **Doğrulama:** `npm test` (232 test; 224 geçti, 8 emülatör testi atlandı), değişen kaynak dosyalarda ESLint temiz, `npx tsc --noEmit` (yalnızca eski `.next` önbelleğindeki silinmiş `payment-check` sayfası hatası), `npm run build` ve `git diff --check`. Modal oturum gerektirdiği için tarayıcıda gerçek Firestore verisiyle denenmedi.
- **Kalan iş:** Canlıda bir aracının detayını açıp rozetlerin ilgili YouTuber detayındakilerle örtüştüğünü kontrol etmek.

## 2026-11-25 — YouTubers sayfasında otomatik Beklenen Ödemeler

- **Değişiklik ve neden:** Follow Ups'taki beklenen ödemeler elle giriliyor. YouTubers sayfasına, ödeme durumu “Ödenmedi” olan video atamalarını manuel listedeki gibi YouTuber bazında gruplayan otomatik ve salt okunur bir “Beklenen Ödemeler” modalı eklendi. Durum, YouTuber detayındaki Videolar sekmesiyle aynı `buildVideoPaymentMap` kuralıyla hesaplanır; kısmi ödenenler gösterilmez. Grup başlığından kişinin detayı açılabilir. Manuel `pendingPayments` akışı değişmedi.
- **Dosyalar:** `src/lib/unpaid-videos.ts`, `src/components/UnpaidVideosModal.tsx`, `src/components/UnpaidVideosModal.module.css`, `src/app/(protected)/catalog/page.tsx`, `src/app/(protected)/catalog/Catalog.module.css`, `tests/unpaid-videos.test.ts`; harita: giriş tablosu, “Ödemeye video bağlama ve ödeme durumu” bölümü ve test tablosu güncellendi.
- **Doğrulama:** `npm test` (231 test; 223 geçti, 8 emülatör testi atlandı), değişen dosyalarda ESLint temiz, `npx tsc --noEmit` (yalnızca eski `.next` önbelleğindeki silinmiş `payment-check` sayfası hatası) ve `npm run build` geçti. Modal oturum gerektirdiği için tarayıcıda gerçek Firestore verisiyle denenmedi.
- **Kalan iş:** Canlıda listeyi açıp sayıların YouTuber detaylarındaki “Ödenmedi” rozetleriyle örtüştüğünü kontrol etmek. Atamalarda fiyat alanı olmadığından tutar gösterilmiyor.

## 2026-11-25 — Ödeme video seçimi katalog bazlı, aranabilir; Videolar sekmesinde yalnızca not düzenleme

- **Değişiklik ve neden:** Kullanıcı geri bildirimi: ödeme seçicisinde yalnızca YouTuber'ın atamaları (silinmiş katalog videoları “Bilinmeyen Video” olarak) çıkıyordu, arama yoktu; Videolar sekmesindeki Düzenle tüm atamayı açıyordu. Bağlantı modeli atama yerine videoya geçirildi (`records.paidVideos`); seçici tüm katalog videolarını, atananları üstte olacak şekilde ve arama kutusuyla gösteriyor. Önceki sürümün yazdığı `paidAssignments` okunuyor ve kayıt düzenlenince `paidVideos`'a taşınıyor. Videolar sekmesindeki kalem düğmesi artık yalnızca notu kart içinde düzenliyor; Para sekmesindeki ödeme düzenleme aynı kaldı.
- **Dosyalar:** `src/lib/payment-links.ts`, `src/components/PaymentVideoLinks.tsx`, `src/components/PaymentVideoLinks.module.css`, `src/components/RecordModal.tsx`, `src/components/CalendarModal.tsx`, `src/components/CalendarModal.module.css`, `src/app/(protected)/calendar/page.tsx`, `tests/payment-links.test.ts`; harita: “Ödemeye video bağlama ve ödeme durumu” bölümü, giriş tablosu ve `records` satırı güncellendi.
- **Doğrulama:** `npm test` (228 test; 220 geçti, 8 emülatör testi atlandı), tip kontrolü, değişen bileşenlerde ESLint (takvim sayfasındaki önceden var olan `any` hataları dışında temiz), `npm run build` ve `git diff --check` geçti. Seçici geçici bir sayfada örnek verilerle yerel tarayıcıda denendi (arama “inek” → “İnek…”, seçim, seçim özeti, atanmış video etiketi, başka ödemeden gelen kısmi durum; 375 px). Gerçek Firestore ile `RecordModal`/`CalendarModal` ve satır içi not düzenleme oturum gerektirdiği için denenmedi.
- **Kalan iş:** Canlıda bir ödemeye arama ile video bağlayıp Videolar sekmesindeki rozetleri ve not düzenlemeyi kontrol etmek.

## 2026-11-25 — Ödemelere çoklu video bağlama ve YouTuber video düzenleme

- **Değişiklik ve neden:** Bir ödeme birden fazla videonun parasını içerebildiği için gelir kayıtlarına `paidAssignments` (atama kimliği + tam/kısmi) alanı eklendi; hangi satışların ödendiği takip edilebilsin diye YouTuber detayının Videolar sekmesinde yeşil “Ödendi”, turuncu “Kısmi ödendi”, kırmızı “Ödenmedi” rozetleri ve durum sayıları gösteriliyor. Atama ve ödeme düzenlemek için takvime gitmek gerekmesin diye Videolar ve Para sekmelerine “Düzenle” düğmesi eklendi (aynı `RecordModal`). Takvimdeki gelir kartları bağlı video adlarını gösteriyor. Turuncu için `--accent-orange` tokenı eklendi.
- **Dosyalar:** `src/lib/payment-links.ts`, `src/components/PaymentVideoLinks.tsx`, `src/components/PaymentVideoLinks.module.css`, `src/components/RecordModal.tsx`, `src/components/CalendarModal.tsx`, `src/components/CalendarModal.module.css`, `src/app/(protected)/calendar/page.tsx`, `src/app/globals.css`, `tests/payment-links.test.ts`; harita: giriş tablosu, yeni “Ödemeye video bağlama ve ödeme durumu” bölümü, `records` veri satırı ve test tablosu güncellendi.
- **Doğrulama:** `npm test` (227 test; 219 geçti, 8 emülatör testi atlandı), `npx tsc --noEmit` (yalnızca eski `.next` önbelleğindeki silinmiş kontrol sayfası hatası), değişen dosyalarda ESLint (takvim sayfasındaki önceden var olan `any` hataları dışında temiz), `npm run build` ve `git diff --check` geçti. Seçim bileşeni ve rozetler geçici bir sayfada örnek verilerle yerel tarayıcıda masaüstü ve 375 px genişlikte denendi (çoklu seçim, Tam/Kısmi geçişi, başka ödemeden gelen durum). Gerçek Firestore verisiyle `RecordModal`/`CalendarModal` akışı ve iç içe modal görünümü oturum gerektirdiği için denenmedi.
- **Kalan iş:** Canlıda bir ödemeye birkaç video bağlayıp YouTuber detayında rozetleri ve Düzenle düğmesini kontrol etmek. Video detayındaki (Videolar sayfası) atanan YouTuber listesinde ödeme durumu henüz gösterilmiyor.

## 2026-11-22 — Telegram'dan yanlış müşteri videosu eşleşmesini kaldırma

- **Değişiklik ve neden:** Otomatik eşleştirme başlık benzerliği yüzünden bazen yanlış videoyu yüksek güvenle yazabiliyordu ve bunu geri almanın, aynı videonun tekrar yazılmasını engellemenin yolu yoktu. Yeni `POST /api/integrations/customer-videos/reject` ucu (`decideCustomerVideoRejection`) videoyu atamanın `customerVideoRejectedIds` listesine ekler ve bağlantı bu videoysa bağlantıyı ve otomatik eşleşme bilgisini siler. Apps Script'in günlük Telegram özetinde otomatik yazılan her link numaralandırıldı ve “❌ yanlış, kaldır” butonu eklendi; buton Telegram yoklamasından `cvsHandleRejectCallback_` ile işlenir. Repodaki `CustomerVideoSync.gs` canlıdaki sürümle eşitlendi (Telegram özeti, OpenAI `invalid_prompt` yeniden denemesi, `CacheService` önbelleği zaten canlıdaydı, repoda yoktu).
- **Dosyalar:** `src/lib/customer-video-sync.ts`, `src/app/api/integrations/customer-videos/reject/route.ts`, `src/lib/audit-log.ts`, `tests/customer-video-sync.test.ts`, `integrations/apps-script/CustomerVideoSync.gs`; harita: müşteri videosu bölümü ve API tablosu güncellendi. Outreach projesindeki `AIChannelReview.gs` içinde `baiHandleTelegramUpdate_` `cvsx:` butonlarını yönlendirir (bu dosya bu repoda yok).
- **Doğrulama:** `tests/customer-video-sync.test.ts` (31 test) geçti; yeni karar fonksiyonu, ret sonrası `PREVIOUSLY_REJECTED` davranışı ve reject route'unun yetki/gövde ön kontrolleri test edildi. Gerçek Firestore transaction'ı ve Telegram butonu bu ortamda çalıştırılmadı.
- **Dağıtım:** `main`'e push edildi; Vercel'de `POST /api/integrations/customer-videos/reject` anahtarsız isteğe 401 döndürüyor (uç canlı). Apps Script tarafı outreach projesine kaydedildi ve sonraki Telegram yoklamaları sorunsuz çalıştı.
- **Kalan iş:** İlk gerçek Telegram özetinde butonun denenmesi.

## 2026-11-20 — Sekme ikonu Blume logosu oldu

- **Değişiklik:** Chrome sekmesinde görünen varsayılan Next/Vercel `src/app/favicon.ico` kaldırıldı; yerine blumeplugins.vercel.app'in kullandığı 128×128 PNG logo `src/app/icon.png` olarak eklendi. Proje haritasındaki ortak görünüm satırı ve tema bölümü güncellendi.
- **Doğrulama:** `npm run build` geçti; derlenen giriş sayfasında `<link rel="icon" href="/icon.png?..." type="image/png">` üretildiği ve dosya hash'inin Blume Plugins'teki ikonla aynı olduğu görüldü. Canlı sitede sekme ikonu, Vercel dağıtımından sonra kontrol edilmeli (tarayıcı eski favicon'u önbellekte tutabilir).

## 2026-11-16 — Takvim noktalarının görünürlüğü

- **Değişiklik:** Gelir, gider ve video noktalarının çapı 4 pikselden 8 piksele, aralarındaki boşluk 2 pikselden 4 piksele çıkarıldı. `src/app/(protected)/calendar/Calendar.module.css` içinde takvime özel daha doygun yeşil, kırmızı ve mavi tonlar kullanıldı. Proje haritasındaki takvim açıklaması güncellendi.
- **Doğrulama:** Örnek verilerle Chrome’da 320 ve 1280 piksel genişlikte üç noktanın beklenen renk, boyut ve aralıklarla tek gün hücresine sığdığı ve gün seçiminin çalıştığı doğrulandı. `git diff --check` geçti.

## 2026-11-16 — Discord export yeniden Follow Ups ile sınırlı

- **Değişiklik:** Ana sayfadaki export, mesaj gönderilecek kişiler Follow Ups’a eklenerek seçilebilsin diye önceki kapsamına döndürüldü. Ülke gruplaması mevcut arama/statü kapsamındaki takiplerin bağlı YouTuber kayıtlarını alır. Home, `DiscordExport.tsx`, `discord-contacts.ts`, ilgili testler ve proje haritasındaki export açıklaması önceki sürüme döndürüldü.
- **Doğrulama:** Beş Discord testi ve `git diff --check` geçti. Örnek Firestore yayınlarıyla Chrome’da katalogda olup takibi bulunmayan bir kişinin export dışında kaldığı, takip eklendikten sonra export’a girdiği, ülke seçimi ve aramanın çalıştığı doğrulandı. Canlı Firestore doğrulaması ve dağıtım yapılmadı.

## 2026-11-16 — Takvim noktaları, Discord export kapsamı ve ülke sırası

- **Değişiklik:** Takvimde gün numarası altında gelir yeşil, gider kırmızı ve video ataması mavi noktayla gösterilir. Aynı günde üç nokta yan yana sığar. Ana sayfadaki export, Tümü görünümünde takip kaydı olmayan katalog kişilerini de kapsar. Varsayılan seçim açıkken yeni Discord ID’leri export’a anında girer. YouTubers sayfasındaki ülke başlıkları ve filtreler Türkçe alfabetik sıradadır.
- **Dosyalar ve harita:** Takvim sayfası ve CSS modülü, Home ve katalog sayfaları, `DiscordExport.tsx`, `discord-contacts.ts`, `tests/discord-contacts.test.ts` ve ilgili proje haritası bölümleri güncellendi.
- **Doğrulama:** `node --import tsx --test tests/*.test.ts` ile 209 test geçti ve 8 emülatör testi atlandı. Örnek Firestore yayınlarıyla gerçek React ekranları Chrome’da 375 ve 1280 pikselde çalıştırıldı. Tekli ve üçlü takvim noktaları, gün seçimi, ülke sırası, yeni Discord ID’sinin açık export’a girmesi, ülke seçimi ve katalog kişisi araması doğrulandı. Eski `.next/dev/types` çıktısı hariç TypeScript kontrolü ve `git diff --check` geçti. Home ve takvimdeki mevcut ESLint hataları HEAD ile karşılaştırıldı ve yeni ihlal görülmedi.
- **Kalan iş:** Canlı Firestore oturumunda doğrulama ve üretim dağıtımı yapılmadı.

## 2026-11-07 — YouTuber kanal linkini sonradan düzenleme

- **Değişiklik ve neden:** YouTuber eklenirken kanal linki girilmezse sonradan eklenemiyordu. YouTuber detayına (`CalendarModal`) açılıp kapanan “Kanal linki” bölümü eklendi: link eklenebilir, değiştirilebilir, boş kaydederek kaldırılabilir. Doğrulama `normalizeChannelUrl` ile yapılır (protokol yoksa `https://`, yalnızca http/https). Modal başlığındaki “Kanalı Ziyaret Et” bağlantısı artık canlı kayıttan gelir.
- **Dosyalar:** `src/components/ChannelLinkEditor.tsx`, `src/components/ChannelLinkEditor.module.css`, `src/lib/channel-url.ts`, `src/components/CalendarModal.tsx`, `src/app/(protected)/catalog/page.tsx`, `tests/channel-url.test.ts`.
- **Harita:** Özellik tablosu ve “YouTuber kanal linki düzenleme” bölümü eklendi.
- **Doğrulama:** `npx tsc --noEmit` (yalnızca `.next/dev/types` içindeki eski geçici sayfa referansı hatası var), yeni/değişen dosyalarda ESLint temiz, `channel-url.test.ts` 3 senaryo Node 22 ile geçti (VM'de macOS `esbuild` olduğundan `tsx` çalışmadı; dosya geçici dizine kopyalanarak çalıştırıldı). Gerçek tarayıcıda/Firestore'da etkileşim doğrulanmadı.
- **Kalan iş:** Canlı oturumda açma/kaydetme elle denenmeli.

## 2026-11-07 — Müşteri videosu entegrasyonu canlıya alındı

- **Değişiklik ve neden:** Vercel Production'a `CUSTOMER_VIDEO_SYNC_SECRET` eklendi ve yeniden deploy edildi. Apps Script dosyası outreach projesine eklendi; OpenAI çağrısı projedeki çalışan AI incelemesiyle aynı biçime (Responses API, katı JSON şeması, `gpt-6-luna`) çevrildi, YouTube anahtarı outreach `CONFIG` değerinden alınır. Ortak `LockService` kilidi outreach işleriyle çakıştığı (ilk dry run “başka bir çalışma sürüyor” diyerek atlandı) için Script Property tabanlı kiralamaya geçildi.
- **Dosyalar:** `integrations/apps-script/CustomerVideoSync.gs`, `docs/PROJECT_MAP.md`.
- **Harita:** Apps Script akışı, kilit ve canlı kurulum yeri güncellendi.
- **Doğrulama:** Node simülasyonu (normal, dry-run, kiralamanın bırakılması) geçti. Canlı ortamda `cvsTestConnection` başarılı (linki boş 130 atama, kanal linki olmayan 1 YouTuber). `cvsDryRun` 26 YouTuber'ı ~2,5 dakikada hatasız taradı, 19 eşleşme buldu (13'ü 0,85 ve üstü); BlumeCore'a yazma yapılmadı. `cvsInstallDailyTrigger` çalıştırıldı. Editördeki dosyanın içeriği depodakiyle SHA-256 ile eşleştirildi.
- **Kalan iş:** İlk gerçek yazma günlük tetikleyiciyle olacak. Öneriler panelde henüz görünmüyor (onay/ret arayüzü sonraki adım).

## 2026-11-07 — Apps Script müşteri videosu entegrasyonu

- **Değişiklik ve neden:** YouTuber'ların sattığımız videoların kendi versiyonlarını Apps Script + OpenAI ile bulup atamaya bağlaması için dar kapsamlı üç uç eklendi: iş listesi (`GET .../pending`), eşleşme bildirimi (`POST`) ve kontrol zamanı (`POST .../checked`). Ayrı `CUSTOMER_VIDEO_SYNC_SECRET` anahtarı kullanılır; Firestore kuralları ve sahip oturumu değişmedi. Eşik üstü güven doğrudan yazılır, eşik altı öneri olarak saklanır; dolu bağlantının üzerine yazılmaz, reddedilen video tekrar kabul edilmez. Eski satışların sürekli aranmaması için satış yaşına göre kontrol takvimi eklendi (ilk 30 gün günlük, 90 güne kadar haftalık, 1 yıla kadar aylık). Outreach projesine eklenecek Apps Script dosyası depoya konuldu.
- **Dosyalar:** `src/lib/customer-video-sync.ts`, `src/lib/server-auth.ts` (`requireCustomerVideoSyncSecret`), `src/lib/audit-log.ts`, `src/app/api/integrations/customer-videos/route.ts`, `.../pending/route.ts`, `.../checked/route.ts`, `tests/customer-video-sync.test.ts`, `integrations/apps-script/CustomerVideoSync.gs`.
- **Harita:** Müşteri videosu bölümü (uçlar, takvim, Apps Script akışı), `assignments` alanları, API tablosu, ortam değişkenleri ve test eşleşmesi güncellendi.
- **Doğrulama:** Bağımlılıkları Linux için ayrıca kurulmuş geçici bir kopyada `npx tsc --noEmit --incremental false`, yeni/değişen dosyaların ESLint kontrolü ve `npm test` geçti (yeni dosyada 24 senaryo). Apps Script dosyası Node'da sahte YouTube/OpenAI/BlumeCore yanıtlarıyla normal ve dry-run modunda çalıştırıldı: gruplama, reddedilen/başka atamaya bağlı videoların elenmesi, satış öncesi videonun reddi, sayfalamanın durması, kanalsız YouTuber'ın işaretlenmemesi ve dry-run'ın yazma yapmaması doğrulandı. Gerçek Firestore transaction'ı, gerçek Google Apps Script/YouTube/OpenAI çağrıları ve canlı Vercel ortamı doğrulanmadı.
- **Kalan iş:** Vercel'e `CUSTOMER_VIDEO_SYNC_SECRET` eklenmeli, Apps Script dosyası outreach projesine eklenip Script Properties ayarlanmalı. Panelde öneri onay/ret, “Otomatik” rozeti ve elle kayıtta `customerVideoSource: 'manual'` sonraki adımdır.

## 2026-11-02 — Aracı ödemelerinde YouTuber

- **Değişiklik:** Aracı detayındaki her ödeme, ilişkili güncel YouTuber adını gösterir; kişi kaydı yoksa bilinmeyen olarak belirtilir. Ödeme verisi değiştirilmez.
- **Dosyalar ve harita:** `src/components/BrokerModal.tsx`, `docs/PROJECT_MAP.md` ve bu kayıt güncellendi.
- **Doğrulama ve kalan iş:** İlgili ESLint ve `git diff --check` kontrolü yapıldı. Canlı Firestore ve oturumlu tarayıcı doğrulanmadı.

## 2026-11-02 — Aracı video satışları

- **Değişiklik:** Aracı detayında her video ataması ayrı sayılır ve ilgili YouTuber adı gösterilir; katalog kaydı eksik videolar da listede kalır. Güncel kişi adı bulunamazsa atamada kayıtlı ad kullanılır.
- **Dosyalar ve harita:** `src/components/BrokerModal.tsx`, `docs/PROJECT_MAP.md` ve bu kayıt güncellendi.
- **Doğrulama ve kalan iş:** İlgili ESLint, kaynak/test tip kontrolü ve `git diff --check` geçti. Varsayılan tip kontrolü `.next/dev/types` içindeki eski geçici sayfa referansı nedeniyle başarısız; alternatif kontrolde üretilmiş dosyalar dışlandı. Canlı Firestore ve oturumlu tarayıcı doğrulanmadı.

## 2026-11-01 — YouTuber video kartlarının düzeni

- **Değişiklik:** YouTuber detayındaki video atamaları belirgin kartlara alındı; müşteri bağlantısı kartın içinde gösterildi ve katalog bağlantısı “Orijinal videoyu izle” olarak açıklandı. Dar ekranlarda başlık ve tarih satır kırabilir.
- **Dosyalar:** `src/components/CalendarModal.tsx`, `src/components/CalendarModal.module.css` ve hafıza belgeleri.
- **Harita:** Video kartı ve bağlantıların görsel ayrımı eklendi; veri akışı değişmedi.
- **Doğrulama:** İlgili ESLint, üretilmiş `.next` türlerini dışlayan kaynak/test tip kontrolü ve `git diff --check` geçti. Gerçek tarayıcıda görsel ve etkileşim kontrolü yapılmadı.

## 2026-11-01 — Müşteri videosu bağlantısı

- **Değişiklik:** Her video atamasına opsiyonel müşteri YouTube bağlantısı eklendi; YouTuber ve video detayları aynı kaydı görüntüler, düzenler, açar ve kopyalar. Boş kaydetme bağlantıyı kaldırır; katalog video bağlantısı korunur.
- **Dosyalar:** `src/components/CustomerVideoLink.tsx`, `CustomerVideoLink.module.css`, `CalendarModal.tsx`, `VideoDetailModal.tsx`, `src/app/(protected)/videos/page.tsx`, `src/lib/customer-video-url.ts`, `tests/customer-video-url.test.ts` ve hafıza belgeleri.
- **Harita:** Ortak alan, doğrulama ve ekran akışı eklendi.
- **Doğrulama ve kalan iş:** İki hedefli URL testi, ilgili ESLint kontrolü (video sayfasında dört mevcut uyarı), kaynak ve testler için tip kontrolü ve `git diff --check` geçti. Varsayılan tip kontrolü `.next/dev/types` altındaki eski geçici sayfa referansı nedeniyle başarısız; ikinci kontrol üretilmiş dosyaları dışladı. Canlı Firestore, pano ve oturum gerektiren ekranlarda etkileşim doğrulanmadı; dağıtım yapılmadı.

## 2026-10-13 — Ana sayfa Discord export’unda ülke seçimi

- **Değişiklik ve neden:** Export penceresi takip aşamaları yerine ülkelerle gruplandı; istenmeyen bir ülkenin tüm kişileri tek kutuyla dışarıda bırakılabilir. Ülkeler ve altlarındaki kişiler Türkçe alfabetik sıralanır. Güncel katalog grubu esas alınır; grup bulunamazsa filtredeki en yeni takip ülkesine dönülür, eksik ülke en sondaki “Ülke belirtilmedi” grubuna alınır. Aynı kişi farklı takiplerde bulunsa da bir kez görünür. Mevcut arama/statü kapsamı, tekil seçim ve kopyalanabilir metin biçimi korunur.
- **Dosyalar:** `src/app/(protected)/home/page.tsx`, `src/components/DiscordExport.tsx`, `src/lib/discord-contacts.ts`, `tests/discord-contacts.test.ts`, hafıza belgeleri.
- **Harita:** Discord export açıklaması ve ilgili test eşleşmesi ülke gruplaması, veri kaynağı, sıralama ve eksik ülke davranışına göre güncellendi. Yeni API, veri yazma veya migration yok.
- **Doğrulama:** `node --import tsx --test tests/discord-contacts.test.ts` ile 5 test, `npx tsc --noEmit --incremental false`, yardımcı/bileşen ESLint kontrolü ve `git diff --check` geçti. Home ESLint kontrolünde HEAD sürümüyle aynı 10 mevcut tırnak hatası/15 uyarı bulundu; ilgili tırnak kuralı yalnızca kontrol komutunda kapatılınca hata kalmadı. Varsayılan Turbopack derlemesi ilerleme çıktısı vermediği için durduruldu; `npm run build -- --webpack` üretim derlemesi geçti. Geçici kontrol sayfasında gerçek export bileşeni ve gruplama yardımcısı örnek verilerle Chrome’da etkileşimli doğrulandı: ülkeyi topluca dışarıda bırakma, tek kişi/kısmi seçim, Discord ID’si olmayan kişinin seçilememesi, tümünü seçme ve boş seçimde Kopyala’nın kapanması. Kontrol sayfası kaldırıldı.
- **Kalan iş:** Canlı oturumdaki Firestore verileri, pano erişimi, gerçek mobil tarayıcı ve üretim dağıtımı bu kontrolde doğrulanmadı.

## 2026-10-06 — Video detayında mobil taşma düzeltmesi

- **Değişiklik ve neden:** Bağlı mod satırları ve erişim özetindeki tek satırlı flex düzenleri dar ekranda yatay taşmaya neden oluyordu. Mod/depo/kişi adları ve rozetler satır kırar; mobil işlem düğmeleri alt satıra geçer. Modal body portalına taşındı, arka sayfa kaydırması açıkken kilitlenir ve kapanınca geri yüklenir. Başlık kaydırma alanından ayrıldı; içerik dinamik ekran yüksekliğine uyar ve yalnızca dikey kaydırılır. Mod bağlama menüsü mobil genişliğe uyar; arama yazısı 16px oldu.
- **Dosyalar:** `src/components/VideoDetailModal.tsx`, `src/components/VideoDetailModal.module.css`, hafıza belgeleri.
- **Harita:** Video detayı mobil yerleşimi, portal/kaydırma ve değişmeyen veri yolları açıklandı.
- **Doğrulama:** TypeScript, ilgili bileşen ESLint kontrolü ve `git diff --check` geçti. Geçici kontrol sayfasında gerçek bileşenin ürettiği HTML ve mevcut CSS, örnek veriler ve etkisizleştirilen hook/portal bağımlılıklarıyla Chrome/Playwright üzerinden kontrol edildi. 320/375/430/768/1280px genişliklerde normal/uzun adlar ve açık/kapalı mod menüsü toplam 20 senaryoda belge ve içerik yatay taşması olmadı; modal ekran içinde, başlık görünür ve içerik dikey kaydırılabilir kaldı. 375px ekran görüntüsü ayrıca görsel incelendi. Bu kontrol canlı React etkileşimi, API/Firestore doğrulaması veya gerçek Safari testi değildir; üretim derlemesi çalıştırılmadı.
- **Kalan iş:** Gerçek iPhone Safari ve canlı oturum etkileşimi doğrulanmadı; dağıtım yapılmadı.

## 2026-10-04 — Discord görünümü ve mobil export kişi seçimi

- **Değişiklik ve neden:** Kaydedilen Discord ID sürekli metin alanında kalmak yerine sabit metin/Ekle/Düzenle görünümünde sunulur; kayıt sonrası form kapanır ve Vazgeç desteklenir. Export kategorileri açılıp kapanır; altındaki YouTuber’lar ayrı kutularla seçilir. Kategori kutuları toplu/kısmi seçim durumunu gösterir. ID’si olmayan kişiler listelenir fakat seçilemez. Kişi seçimi farklı kategorilerde de ortaktır. Genel input padding’inden büyüyen checkbox’lar düzeltildi; mobil pencerede başlık ve Kopyala alanı kaydırılan içerikten ayrıldı.
- **Dosyalar:** `src/components/DiscordContactEditor.tsx`, `DiscordExport.tsx`, `DiscordContacts.module.css`, `src/lib/discord-contacts.ts`, `tests/discord-contacts.test.ts`, hafıza belgeleri.
- **Harita:** Düzenleme modu, açılır kategoriler, tekil kişi seçimi ve mobil kaydırma açıklaması güncellendi.
- **Doğrulama:** Tip kontrolü, ilgili bileşen/yardımcı ESLint kontrolü, üç export testi ve `git diff --check` geçti. `npm run build` optimize derleme aşamasında uzun süre yeni çıktı vermediği için durduruldu; başarılı üretim derlemesi doğrulanmadı. Mobil düzen sağlanan ekran görüntülerindeki sorunlara ve stil kaynaklarına göre düzeltildi; gerçek Safari/Firestore/pano etkileşimi test edilmedi.
- **Kalan iş:** Gerçek mobil tarayıcıda etkileşim kontrolü ve dağıtım yapılmadı.

## 2026-10-04 — Follow Ups export kategori seçimi

- **Değişiklik ve neden:** Follow Ups export penceresine takip aşamalarını seçmek için kutular eklendi. Başlangıçta tüm kategoriler seçilir; tümünü seç/seçimi temizle işlemleri desteklenir. Seçilen kategoriler ve mevcut sayfa araması birlikte uygulanır; metin/kişi sayısı anlık güncellenir. Aynı YouTuber farklı seçili aşamalarda bulunsa da bir satır oluşturulur. Boş seçimde kopyalama kapalıdır. Kategori listesi mobilde kaydırılabilir.
- **Dosyalar:** `src/components/DiscordExport.tsx`, `DiscordContacts.module.css`, `src/app/(protected)/home/page.tsx`, `src/lib/discord-contacts.ts`, `tests/discord-contacts.test.ts`, hafıza belgeleri.
- **Harita:** Follow Ups export kategori seçimi, varsayılanlar ve ilgili yardımcı/test açıklaması güncellendi.
- **Doğrulama:** Tip kontrolü, üç export testi, export bileşeni/yardımcısı ESLint kontrolü ve `git diff --check` geçti. Bu ek adımda üretim derlemesi tekrarlanmadı; önceki Discord ekleme adımında geçmişti. Tarayıcı/mobil etkileşim kontrolü yapılmadı.
- **Kalan iş:** Canlı ortam dağıtımı ve gerçek tarayıcıda kategori seçimi/pano doğrulaması yapılmadı.

## 2026-10-04 — YouTuber Discord bilgisi ve kopyalanabilir export

- **Değişiklik ve neden:** Katalog oluşturma formuna opsiyonel Discord ID, kişi detayına sonradan ekleme/düzenleme/kaldırma alanı eklendi. Follow Ups kartlarında ülkenin yanında canlı YouTuber kaydındaki ID gösterilir. Her iki sayfaya mevcut arama/filtredeki dolu Discord bilgilerini kişi başına tek satır sunan export penceresi ve Kopyala düğmesi eklendi; pano hatasında elle kopyalama için metin seçilir. Dar ekran başlıkları, rozetler, form ve export penceresi için responsive stiller eklendi.
- **Dosyalar:** `src/app/(protected)/catalog/page.tsx`, `Catalog.module.css`, `src/app/(protected)/home/page.tsx`, `Home.module.css`, `src/components/CalendarModal.tsx`, `DiscordContactEditor.tsx`, `DiscordExport.tsx`, `DiscordContacts.module.css`, `src/lib/discord-contacts.ts`, `tests/discord-contacts.test.ts`, hafıza belgeleri.
- **Harita:** Discord düzenleme/export akışı, opsiyonel `youtubers.discordId` metin alanı ve ilgili test kaydı eklendi. Yeni API veya migration yok.
- **Doğrulama:** `npx tsc --noEmit --incremental false`, `npm run build`, iki hedefli export testi ve `git diff --check` geçti. Yeni bileşen/yardımcı, katalog ve CalendarModal ESLint kontrolü geçti. Home ESLint kontrolü 10 mevcut tırnak hatası ve 15 uyarı nedeniyle başarısız; HEAD sürümü aynı sonuçla ayrıca kontrol edildi.
- **Kalan iş:** Gerçek Firestore kaydetme, Clipboard API ve oturum gerektiren masaüstü/mobil ekranlar etkileşimli tarayıcıda doğrulanmadı. Değişiklik yerel kaynakta; dağıtım yapılmadı.

> 2026-10-03: Deponun public yapılmasının ardından Vercel dağıtımını yeniden tetiklemek için dokümantasyon commit'i oluşturuldu.

## 2026-10-03 — Açık vurgulu koyu arayüz

- **Değişiklik ve neden:** Önceki açık tema kullanıcının görsel referansına göre fazla parlaktı. Zemin antrasit (`#1E1E24`), kartlar koyu gri, başlık ve seçim vurguları açık nane yeşili (`#B5E4D0`) yapıldı. Beyaz yazılı düğmelerde ayrı koyu yeşil/kırmızı yüzeyler, koyu temaya uygun saydam arka planlar ve açık takip aşaması renk paleti kullanıldı. Kayıtlı aşama renkleri değiştirilmedi.
- **Dosyalar:** `src/app/globals.css`, `src/app/login/Login.module.css`, ilgili `src/app/(protected)` ekranları ve `src/components` kart/modal stilleri ile satır içi stiller, `src/lib/statuses.ts`, `docs/PROJECT_MAP.md`.
- **Harita:** Görsel tema ve aşama rengi açıklaması koyu tema için güncellendi.
- **Doğrulama:** `npx tsc --noEmit --incremental false`, `npm run build`, `git diff --check` geçti. `npm test`: 175 başarılı, Firestore emülatörü çalışmadığı için 8 atlandı. Yerel giriş ekranı tarayıcıda görsel olarak kontrol edildi. Açık nane metninin koyu zeminle hesaplanan kontrastı 11,82:1; beyaz yazılı yeşil düğmenin kontrastı 4,74:1. `npm run lint` önceki kayıtla aynı 31 mevcut hata ve 36 uyarı nedeniyle başarısız.
- **Kalan iş:** Oturum gerektiren ekranlar yerel tarayıcıda görsel olarak doğrulanmadı; mevcut lint hataları ayrı çalışmada ele alınmalı.

## 2026-10-03 — Açık yeşil ve gri arayüz paleti

- **Değişiklik ve neden:** Koyu mor tema yerine açık gri zemin, beyaz kart, yumuşak yeşil vurgu ve koyu okunaklı metin kullanıldı. Giriş, alt menü, korumalı sayfalar, ödeme/video/oyuncu kartları ve modalların sabit koyu renkleri yeni palete uyarlandı. Aşama rozetlerinin metni açık zeminde koyu gösterildi; eski Home CSS import yolları düzeltildi.
- **Dosyalar:** `src/app/globals.css`, `src/app/(protected)` altındaki ekran CSS/TSX dosyaları, `src/components` altındaki ilgili kart ve modal CSS/TSX dosyaları, `src/lib/statuses.ts`, `docs/PROJECT_MAP.md`.
- **Harita:** Tema renk rolleri ve aşama görünümü eklendi; çözülmüş Home CSS import sınırlaması kaldırıldı.
- **Doğrulama:** `npx tsc --noEmit --incremental false`, `npm run build`, `git diff --check` ve `npm test` geçti (175 başarılı, çalışmayan Firestore emülatörü nedeniyle 8 atlandı). Yerel tarayıcıda giriş ekranı görsel olarak kontrol edildi; yeşil ana düğmenin beyaz metinle hesaplanan kontrastı 6,54:1. `npm run lint` depoda önceden bulunan 31 hata nedeniyle başarısız; renk değişikliklerinden kaynaklanan yeni bir hata saptanmadı.
- **Kalan iş:** Oturum gerektiren ekranlar ve gerçek mobil tarayıcı görsel olarak doğrulanmadı; mevcut lint hataları ayrı çalışmada ele alınmalı.

## 2026-10-03 — Beklenen ödeme gruplarının sırası sabitlendi

- **Değişiklik ve neden:** Beklenen ödemelerde grup sırası Firestore kayıtlarının geliş sırasına bağlıydı; bir YouTuber'ın ilk ödemesi silinince grup başka konuma taşınabiliyordu. Gruplar güncel YouTuber adına, silinmiş YouTuber kayıtlarında sabit kimliğe ve eşit sıralama anahtarlarında grup kimliğine göre sıralandı.
- **Dosyalar:** `src/components/PendingPaymentsModal.tsx`, `src/lib/pending-payments.ts`, `tests/pending-payments.test.ts`.
- **Harita:** Beklenen ödeme girişine gruplama fonksiyonu ve ilgili test eklendi.
- **Doğrulama:** `node --import tsx --test tests/pending-payments.test.ts` ile tekil silme/kayıt sırası değişimi ve silinmiş YouTuber senaryolarındaki iki test geçti. `npx tsc --noEmit --incremental false`, ilgili ESLint kontrolü ve `git diff --check` geçti.
- **Kalan iş:** Gerçek Firestore ve mobil tarayıcı üzerinde etkileşimli doğrulama yapılmadı.

## 2026-10-03 — Gider gizleme ve beklenen ödeme mobil başlığı

- **Değişiklik ve neden:** Takvimdeki bu ay/genel gider tutarları da kayıtlı görünürlük ayarına bağlandı; ayar metni gelir ve gideri birlikte belirtir. Beklenen ödeme grubu başlığında YouTuber adı ile işlem düğmeleri ilk satıra, ödeme sayısı ve toplam ikinci satıra taşındı; dar ekranda üst üste binme giderildi.
- **Dosyalar:** `src/app/(protected)/calendar/page.tsx`, `src/app/(protected)/settings/page.tsx`, `src/components/PendingPaymentsModal.tsx`, `src/components/PendingPaymentsModal.module.css`.
- **Harita:** Takvim, ayarlar, beklenen ödeme ve `user_settings` açıklamaları güncellendi.
- **Doğrulama:** `npx tsc --noEmit --incremental false`, ödeme/profil bileşenlerine yönelik ESLint ve `git diff --check` geçti. Takvim sayfası, önceden var olan `any` lint hataları geçici olarak devre dışı bırakılarak ayrıca kontrol edildi; yalnızca önceden var olan kullanılmayan değişken uyarıları kaldı. Dar ekran yerleşimi kod ve sağlanan mobil ekran görüntüsü üzerinden değerlendirildi.
- **Kalan iş:** Gerçek mobil tarayıcıda oturum açılarak ekran doğrulanmadı.

## 2026-10-03 — Beklenen ödemelerde toplu silme ve gelir görünürlüğü

- **Değişiklik ve neden:** Beklenen ödemelerde YouTuber başlığına tüm alt ödemeleri silen düğme eklendi; silme iki ayrı onaydan sonra Firestore batch'leriyle yapılır. Takvimdeki “Bu Ay Gelir” ve “Genel Gelir” varsayılan olarak `****` gösterilir; profil ayarı açıldığında rakamlar görünür. Ayar Firestore'da kalıcıdır ve yükleme/hata durumunda tutarlar gizli kalır.
- **Dosyalar:** `src/components/PendingPaymentsModal.tsx`, `src/app/(protected)/calendar/page.tsx`, `src/app/(protected)/settings/page.tsx`, `src/app/(protected)/settings/Settings.module.css`, `src/lib/income-visibility.ts`.
- **Harita:** Beklenen ödeme, takvim ve ayarlar girişleri ile `user_settings` koleksiyonu güncellendi.
- **Doğrulama:** `npx tsc --noEmit --incremental false`, değişen yeni/profil/ödeme dosyalarına yönelik ESLint ve `git diff --check` geçti. `npm test`: 173 başarılı, 8 emülatör testi emülatör çalışmadığı için atlandı. Genel `npm run lint`, depoda önceden mevcut olan takvim ve diğer dosyalardaki hatalar yüzünden başarısız. `npm run build`, optimize derleme aşamasında çıktı üretmeden uzun süre kaldığı için durduruldu.
- **Kalan iş:** Gerçek Firebase, tarayıcı arayüzü ve üretim derlemesiyle doğrulama yapılmadı.

## 2026-10-03 — Kalıcı proje rehberi oluşturuldu

- **Değişiklik ve neden:** Yeni sohbetlerin proje bağlamını dosyalardan alması, kullanıcı isteğini ilgili kaynak koda eşleştirmesi ve geliştirme sonrası hafızayı güncellemesi için başlangıç kuralları oluşturuldu.
- **Dosyalar:** `AGENTS.md`, `docs/PROJECT_MAP.md`, `docs/DEVELOPMENT_LOG.md`; `README.md` içine rehber bağlantıları eklendi. Mevcut kurulum ve iki migration belgesine güncel kodla karşılaştırma notları eklendi.
- **Harita:** Ekran/bileşen, API, servis, koleksiyon ve test eşleşmeleri; oturum, erişim, README sync, silme/arşivleme akışları kaynak koddan incelenerek yazıldı. Eski CSS importları, retry durum uyumsuzluğu ve tarihsel belge farkları sınırlamalar bölümüne kaydedildi.
- **Doğrulama:** Yerel dosya kontrolüyle 16 Markdown bağlantısı, 67 farklı kaynak/belge yolu, test dosyası adları ve boşluk/satır sonu biçimi doğrulandı; `git diff --check` geçti. `AGENTS.md` yaklaşık 5,3 KB'dır. Uygulama kodu değişmedi; uygulama testleri, build, emülatör ve canlı ortam kontrolü bu çalışma kapsamında çalıştırılmadı.
- **Kalan iş:** Belgelendirme dışındaki kod gözlemleri proje haritasında listelenmiştir; bu görevde düzeltildiği iddia edilmez.

## Yeni kayıt biçimi

Bu şablonu kopyalayıp yeni kaydı tarihli kayıtların başına ekle; köşeli alanları gerçek sonuçlarla değiştir.

```md
## YYYY-MM-DD — Kısa görev başlığı

- **Değişiklik ve neden:** [Tamamlanan davranış / düzeltme ve amacı.]
- **Dosyalar:** [İlgili depo yolları; gerekirse ana fonksiyon adları.]
- **Harita:** [Güncellenen bölüm veya “Kontrol edildi; mevcut harita etkilenmedi.”]
- **Doğrulama:** [Çalıştırılan komut/senaryo ve sonucu; atlanan kontroller ve nedeni.]
- **Kalan iş:** [Yok veya gerçek eksik/engel ve sonraki adım.]
```
