# BlumeCore: GitHub Minecraft Mod Sync Kurulum ve Yapılandırma Rehberi

Bu rehber, BlumeCore projesinde GitHub tabanlı Minecraft mod erişimi ve legacy README senkronizasyonunun canlı ortama bağlanması için gerekli adımları açıklar.

---

## 1. Fine-Grained GitHub Token Oluşturma

1. GitHub hesabınızda **Settings** > **Developer Settings** > **Personal access tokens** > **Fine-grained tokens** bölümüne gidin.
2. **Generate new token** butonuna tıklayın:
   - **Token name**: `BlumeCore-ModSync`
   - **Expiration**: Güvenlik politikanıza uygun bir süre seçin (örn. 90 gün veya 1 yıl).
   - **Resource owner**: `blumeplugins` organizasyonunu (veya `GITHUB_ALLOWED_OWNER` değerini) seçin.
3. **Repository access**:
   - `Only select repositories` seçin ve BlumeCore ile yönetilecek mod depolarını (örn. `DyingIsOP`, `WalkingLuckyBlocks`) tek tek ekleyin.
4. **Permissions** > **Repository permissions**:
   - **Contents**: `Read and write` olarak ayarlayın. (README dosyasını okuma ve commit atma yetkisi için gereklidir).
   - Diğer tüm izinleri `No access` olarak bırakın (en az yetki prensibi).
5. **Generate token** butonuna basarak üretilen token'ı kopyalayın (Token `github_pat_...` formatında olacaktır).

> [!CAUTION]
> GitHub token'ını asla frontend (`NEXT_PUBLIC_...`) kodlarına, Git commit'lerine veya herkese açık kanallara koymayın. Token yalnızca sunucu tarafında (`process.env.GITHUB_TOKEN`) saklanmalıdır.

---

## 2. Vercel Environment Variables Yapılandırması

Vercel kontrol panelinize gidin:
1. Projenizin **Settings** > **Environment Variables** bölümünü açın.
2. Aşağıdaki değişkenleri tanımlayın:
   - `GITHUB_TOKEN`: Ürettiğiniz `github_pat_...` değeri (Production, Preview, Development).
   - `GITHUB_ALLOWED_OWNER`: `blumeplugins`
   - `GITHUB_API_VERSION`: `2026-03-10`
   - `CRON_SECRET`: Güçlü rastgele bir string (örn. `openssl rand -hex 32`).
3. Değişkenleri kaydettikten sonra **Redeploy** yaparak yeni değişkenlerin geçerli olmasını sağlayın.

---

## 3. ModProject Oluşturma ve Güvenli İlk Kullanım

1. BlumeCore web panelinde **Videolar** sayfasına gidin ve üstteki **[ Modlar ]** sekmesine geçin.
2. **Yeni Mod Ekle** butonuna tıklayın:
   - **Mod ID**: `DyingIsOP`
   - **Görünen Ad**: `Dying Is OP`
   - **GitHub Owner**: `blumeplugins`
   - **Repository**: `DyingIsOP`
   - **Branch**: `main`
   - **Allowlist Dosyası**: `README.md`
3. **Bağlantıyı Test Et** butonuna basın:
   - Sistem GitHub API üzerinden dosyayı salt okunur (read-only) çeker.
   - Depo, branch, README varlığı, eski (unmanaged) UUID'ler ve BlumeCore managed marker durumu analiz edilir.
4. Mod kaydedildikten sonra **Detay** ekranından **README'yi Kontrol Et** butonunu kullanarak canlı dosya ile beklenen durum arasındaki farkı (preview/diff) görüntüleyebilirsiniz.
5. Hazır olduğunuzda **Şimdi Senkronize Et** veya **Düzelt** butonuna basarak ilk güvenli commit'in atılmasını sağlayın.

---

## 4. Günlük İşleyiş ve Otomatik Tetikleyiciler

* **Takvimden Video Atama**: Takvimde mod bağlı bir video YouTuber'a atandığında, YouTuber'ın aktif Minecraft oyuncuları otomatik olarak allowlist'e eklenir ve GitHub'a commit atılır.
* **Oyuncu Değişiklikleri**: YouTuber'a yeni Minecraft oyuncusu bağlandığında, UUID değiştiğinde veya pasife alındığında ilgili modlar otomatik yeniden senkronize edilir.
* **Videosuz Modlar**: Mod detayından **[+ YouTuber Ekle]** butonu ile videodan bağımsız manuel yetkilendirme yapılabilir.
* **Yetki Kaldırma**: YouTuber mod erişimi kaldırıldığında BlumeCore managed bölümündeki satırlar çıkarılır. Unmanaged (legacy) bölümde önceden bulunan satırlar korunur ve ekranda uyarı verilir.

---

## 5. Hata Yönetimi ve Manuel Retry

* Eğer GitHub API rate limit veya ağ hatası verirse, işlem geri alınmaz. Veritabanındaki `github_sync_jobs` kaydı `FAILED` olarak işaretlenir.
* Mod kartındaki **Tekrar Dene** veya **Şimdi Senkronize Et** butonu ile işlem anında yeniden çalıştırılabilir.
* Vercel Cron (`0 3 * * *`) gece otomatik olarak kalan veya başarısız olan işleri exponential backoff ile yeniden dener.

---

## 6. Token Yenileme (Rotation) ve Yeni Depo Ekleme

* **Token Süresi Dolduğunda**: GitHub'da token'ı yenileyin (Regenerate) ve Vercel Environment Variables üzerinden `GITHUB_TOKEN` değerini güncelleyin.
* **Yeni Mod Eklendiğinde**: Fine-grained token kullanıyorsanız GitHub Settings > Personal Access Tokens bölümünden mevcut token'ın repository access listesine yeni eklenen mod reposunu dahil etmeyi unutmayın.
* **Gelecek Genişletmesi**: Çok sayıda depo yönetimi veya kurumsal webhook gereksinimleri için Fine-grained PAT yerine GitHub App mimarisine geçiş yapılabilir. Mevcut REST Contents API istemcisi GitHub App kurulum token'ları ile doğrudan uyumludur.
