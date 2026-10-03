# BlumeCore — Geliştirme kaydı

Yeni sohbetlerde önce [AGENTS.md](../AGENTS.md) ve [proje haritasını](PROJECT_MAP.md), sonra bu dosyanın başındaki son kayıtları oku. En yeni kayıt en üstte olmalıdır. Bu günlük Git geçmişinin veya güncel mimari haritasının yerine geçmez.

Her görev için kısa kayıt tut: ne/neden değişti, ilgili dosyalar, gerçekten yapılan doğrulama ve varsa kalan iş. Kod/konfigürasyon değiştiğinde haritayı kontrol et; etkilenen bilgiyi haritada da yerinde güncelle. Secret, kişisel veri veya tam araç çıktısı ekleme. Salt okunur soru/yanıtları kaydetme.

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
