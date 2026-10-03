# BlumeCore — Geliştirme kaydı

Yeni sohbetlerde önce [AGENTS.md](../AGENTS.md) ve [proje haritasını](PROJECT_MAP.md), sonra bu dosyanın başındaki son kayıtları oku. En yeni kayıt en üstte olmalıdır. Bu günlük Git geçmişinin veya güncel mimari haritasının yerine geçmez.

Her görev için kısa kayıt tut: ne/neden değişti, ilgili dosyalar, gerçekten yapılan doğrulama ve varsa kalan iş. Kod/konfigürasyon değiştiğinde haritayı kontrol et; etkilenen bilgiyi haritada da yerinde güncelle. Secret, kişisel veri veya tam araç çıktısı ekleme. Salt okunur soru/yanıtları kaydetme.

> 2026-10-03: Deponun public yapılmasının ardından Vercel dağıtımını yeniden tetiklemek için dokümantasyon commit'i oluşturuldu.

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
