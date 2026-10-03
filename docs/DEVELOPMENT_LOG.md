# BlumeCore — Geliştirme kaydı

Yeni sohbetlerde önce [AGENTS.md](../AGENTS.md) ve [proje haritasını](PROJECT_MAP.md), sonra bu dosyanın başındaki son kayıtları oku. En yeni kayıt en üstte olmalıdır. Bu günlük Git geçmişinin veya güncel mimari haritasının yerine geçmez.

Her görev için kısa kayıt tut: ne/neden değişti, ilgili dosyalar, gerçekten yapılan doğrulama ve varsa kalan iş. Kod/konfigürasyon değiştiğinde haritayı kontrol et; etkilenen bilgiyi haritada da yerinde güncelle. Secret, kişisel veri veya tam araç çıktısı ekleme. Salt okunur soru/yanıtları kaydetme.

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
