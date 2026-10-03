# Migration Rehberi: Minecraft Oyuncu Yönetim Sistemi

> Tarihsel belge notu (2026-10-03): Bu metin ilk oyuncu şemasını anlatır. Güncel uygulama tek sahip modeli kullanır; aşağıdaki tenant izolasyonu ifadesi mevcut güvenlik kurallarını tanımlamaz. Global oyuncular ve modlara değişiklik yayılımı için [proje haritasını](../PROJECT_MAP.md), güncel oyuncu tipi/API'lerini ve `firestore.indexes.json` dosyasını inceleyin.

Bu döküman, BlumeCore projesine eklenen Minecraft oyuncu yönetim sisteminin veritabanı şema ve kurallarını açıklar.

## 1. Veri Modeli ve Koleksiyon Yapısı

Sistem iki koleksiyon üzerine kuruludur:

### 1.1 `minecraft_players` (Global Oyuncu Havuzu)
Tekil Minecraft oyuncularının global kimliklerini tutar:
* `id`: Firestore auto-generated ID
* `username`: string (3-16 karakter)
* `uuid`: string (36 karakter, canonical lowercase `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
* `createdAt`: timestamp
* `updatedAt`: timestamp

**Kısıtlar:**
* `uuid` tekildir. Eklenen UUID veritabanında zaten varsa yeni kayıt oluşturulmaz, mevcut oyuncu referans alınır ve gerekiyorsa username güncellenir.
* Bu koleksiyondan bir YouTuber bağlantısı silindiğinde kayıt SİLİNMEZ.

### 1.2 `youtuber_minecraft_players` (YouTuber - Oyuncu İlişkisi)
Bir YouTuber ile bir Minecraft oyuncusu arasındaki ilişkiyi tutar:
* `id`: Firestore auto-generated ID
* `youtuberId`: string (ilgili `youtubers` belgesi ID'si)
* `minecraftPlayerId`: string (ilgili `minecraft_players` belgesi ID'si)
* `relationshipType`: `'owner' | 'friend' | 'team' | 'other'`
* `isPrimary`: boolean (Bir YouTuber için en fazla 1 adet `true` olabilir)
* `isActive`: boolean (true: aktif, false: pasif)
* `note`: string | null (opsiyonel not)
* `userId`: string (kaydı oluşturan BlumeCore yöneticisi / kullanıcısı)
* `createdAt`: timestamp
* `updatedAt`: timestamp

## 2. Sıfır Veri Kaybı Garantisi
* Mevcut `youtubers`, `records`, `videos`, `youtube_videos` koleksiyonlarına hiçbir yıkıcı (destructive) müdahale yapılmamıştır.
* Var olan verilerde şema dönüşümü veya reset gereksinimi yoktur.
* `firestore.rules` güncellenmiş ve yeni koleksiyonlar için tenant izolasyonu sağlanmıştır.

## 3. Composite Indexler (Firestore)
Gereken Firestore composite indexleri:
1. `youtuber_minecraft_players`:
   - `youtuberId` (ASCENDING) + `userId` (ASCENDING)
   - `youtuberId` (ASCENDING) + `isActive` (ASCENDING)
   - `youtuberId` (ASCENDING) + `minecraftPlayerId` (ASCENDING)
   - `youtuberId` (ASCENDING) + `isPrimary` (ASCENDING)
