# BlumeCore — Yapay zekâ çalışma rehberi

Bu dosya, bu depoda çalışan yapay zekâ ajanlarının başlangıç rehberidir. Proje hafızası dosyalarda tutulur; önceki sohbetleri bildiğini varsayma. Kullanıcıyla ve yeni proje belgelerinde Türkçe iletişim kur; koddaki mevcut isimlendirmeyi koru.

## Her yeni sohbetin başında

1. [Proje haritasını](docs/PROJECT_MAP.md) oku. Projenin amacını, özellik → dosya eşleşmelerini, kritik akışları ve bilinen sınırlamaları öğren.
2. [Geliştirme kaydının](docs/DEVELOPMENT_LOG.md) en üstündeki son kayıtları oku. Devreden iş veya doğrulanmamış bir sonuç varsa dikkate al.
3. `git status --short` ile mevcut değişiklikleri gör; kullanıcıya ait çalışmaları koru. İlgili alt dizinde ek bir `AGENTS.md` varsa onu da oku.
4. Kullanıcının isteğini haritadaki alanla eşleştir. Haritayı başlangıç noktası olarak kullan, uygulama davranışını güncel kaynak kodundan doğrula. Belgelerle kod çelişirse mevcut davranış için kodu esas al ve belgeyi düzelt; amaçlanan davranışı kullanıcının isteği belirler.

## Geliştirme akışı

- Önce ilgili ekranı/bileşeni, çağırdığı API veya Firestore işlemini, servis fonksiyonunu ve ilgili testleri incele. Yalnızca dosya adına ya da eski belgeye bakarak değişiklik yapma.
- Aramaları önce ilgili dizinde `rg` ile yap. Haritada olmayan bir özellik için `src` ve `tests` içinde araştır; doğruladığın yeni giriş noktasını haritaya ekle.
- Bu proje iki veri yolunu birlikte kullanır: bazı ekranlar Firebase istemcisiyle doğrudan Firestore'a erişir; mod/oyuncu/erişim işlemleri ayrıca sunucu API'lerinden geçer. Değiştirdiğin akışın hangi yolu kullandığını kontrol et.
- `@/*` yolu `src/*` demektir. Korumalı sayfalar `src/app/(protected)` altındadır; `(protected)` URL'nin parçası değildir.
- Bağımlılık ve komut kaynağı `package.json` ile `package-lock.json` dosyalarıdır; paket yöneticisi npm'dir. Doğrulama komutları ve test seçimi proje haritasında bulunur.
- Değişikliğe uygun kontrolleri çalıştır. Simülasyon testlerini gerçek API, tarayıcı veya emülatör doğrulaması yapılmış gibi sunma. Çalıştırılmayan/başarısız kontrolleri açıkça belirt.

## Korunacak proje davranışları

- Uygulama tek sahibine özeldir. Sunucu yetkilendirmesinde `src/lib/server-auth.ts`, korumalı layout'ta oturum çerezi doğrulaması esastır. İstemcinin gönderdiği `userId` veya `x-user-id` kimlik kanıtı değildir. `ADMIN_FIREBASE_UID` eksikken erişimin reddedilmesi korunmalıdır.
- Firebase Admin ve GitHub token'ı sunucu tarafında kalır. `.env*`, servis hesabı dosyaları, token, çerez ve özel anahtar değerlerini belgelere veya değişiklik kayıtlarına kopyalama; yalnızca değişken adlarını yaz.
- Mod erişiminde `grantSources`, manuel kararlar, aktif oyuncular ve Global Blume birlikte değerlendirilir. Bir bağlantıyı silerken diğer geçerli erişim kaynaklarını koruyan akışı incele.
- Normal README senkronizasyonunda managed marker dışındaki legacy içerik korunur; bozuk marker yapısı üzerine yazılmaz. Legacy migration ayrı bir akıştır; normal sync ile karıştırma.
- GitHub senkronizasyonu kalıcı `github_sync_jobs` kuyruğunu kullanır. Kuyruğa alınmayı GitHub'a yazma başarısı sayma. Firestore transaction'larında tüm okumalar yazmalardan önce yapılmalıdır.
- Modu arşivleme, geri getirme ve kalıcı silme farklı işlemlerdir. `deleteModProject` GitHub deposunu veya README'yi silmez; bu ayrımı koru.

## Her değişiklikten sonra hafızayı güncel tut

Dokümantasyon güncellemesi işin tamamlanma koşuludur; kullanıcının ayrıca hatırlatmasını bekleme.

1. Davranış, dosya yolu, özellik, API, veri modeli, bağımlılık, komut veya önemli sınırlama değiştiyse `docs/PROJECT_MAP.md` içindeki ilgili bölümü aynı çalışma kapsamında güncelle. Eski bilgiyi yerinde düzelt; yalnızca günlüğe yeni satır eklemek yeterli değildir.
2. Her kod/yapılandırma değişikliği ve anlamlı dokümantasyon çalışması için `docs/DEVELOPMENT_LOG.md` başına kısa bir kayıt ekle: tarih, ne/neden değişti, ilgili dosyalar, doğrulama ve varsa kalan iş. Harita etkilenmediyse bunu kayıtta belirt. Aynı görevdeki küçük adımları tek kayıtta birleştir.
3. Kurulum veya migration akışı etkilendiyse ilgili mevcut belgeyi de güncelle. Ajanların çalışma yöntemi değişmedikçe bu `AGENTS.md` dosyasını büyütme; alan bilgisini haritada tut.
4. Dosya taşıma/silmede haritadaki yolları ve belge bağlantılarını düzelt. Kalıcı referans olarak satır numarası yerine dosya yolu ve fonksiyon adını kullan.
5. Yalnızca doğruladığın bilgileri yaz. Planları tamamlanmış özellik gibi kaydetme. Tamamlanmamış işi, gerçek durumunu ve sonraki adımı açıkça belirt. Salt okunur soru/yanıtlar için günlük kaydı gerekmez.
6. Son yanıtta yapılan değişikliği, doğrulamayı ve güncellenen hafıza belgelerini kısaca belirt.

Bu dosyayı otomatik yüklemeyen bir yapay zekâ aracında başlangıç talimatı: “Önce kökteki AGENTS.md dosyasını oku ve oradaki proje haritası/geliştirme kaydı akışını uygula.”
