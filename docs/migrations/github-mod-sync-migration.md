# Migration Rehberi: GitHub Tabanlı Minecraft Mod Erişim ve Senkronizasyon Sistemi

Bu doküman, BlumeCore projesine eklenen GitHub tabanlı Minecraft mod projesi yönetimi, video bağlantıları, YouTuber mod erişimi ve legacy README senkronizasyonunun veritabanı şemasını ve mimarisini açıklar.

## 1. Veri Modeli ve Koleksiyon Yapısı

Sistem 6 yeni Firestore koleksiyonu üzerine kuruludur:

### 1.1 `mod_projects` (Mod Tanımları)
Her mod projesinin GitHub repository ve konfigürasyon bilgilerini tutar:
* `id`: Firestore auto-generated ID
* `modKey`: string (unique, örn. `DyingIsOP`)
* `displayName`: string (örn. `Dying Is OP`)
* `description`: string (opsiyonel)
* `githubOwner`: string (yalnızca `GITHUB_ALLOWED_OWNER` değerine eşit, varsayılan `blumeplugins`)
* `githubRepository`: string (örn. `DyingIsOP`)
* `branch`: string (varsayılan `main`)
* `allowlistPath`: string (varsayılan `README.md`)
* `syncMode`: `'LEGACY_README'`
* `isActive`: boolean (true: aktif, false: pasif)
* `lastSuccessfulSyncAt`: number | null (epoch timestamp ms)
* `lastSuccessfulCommitSha`: string | null
* `userId`: string (BlumeCore yöneticisi)
* `createdAt`: number
* `updatedAt`: number

### 1.2 `video_mod_projects` (Video - Mod Çoktan-Çoğa İlişkisi)
YouTube videoları ile mod projeleri arasındaki M:N ilişkileri tutar:
* `id`: Firestore auto-generated ID
* `videoId`: string (ilgili `youtube_videos` belgesi ID'si)
* `modProjectId`: string (ilgili `mod_projects` belgesi ID'si)
* `userId`: string
* `createdAt`: number

### 1.3 `youtuber_mod_access` (Kalıcı Mod Erişim Kayıtları)
YouTuber'ların modlara olan erişim yetkilerini saklar:
* `id`: Firestore auto-generated ID
* `youtuberId`: string (`youtubers` belgesi ID'si)
* `modProjectId`: string (`mod_projects` belgesi ID'si)
* `status`: `'ACTIVE' | 'REVOKED'`
* `grantType`: `'VIDEO_ASSIGNMENT' | 'MANUAL'`
* `manualDecision`: `'NONE' | 'FORCE_ALLOW' | 'FORCE_DENY'`
* `sourceVideoAssignmentId`: string | null (Takvim ataması ID'si)
* `grantedAt`: number
* `grantedByUserId`: string
* `revokedAt`: number | null
* `revokedByUserId`: string | null
* `revokeReason`: string | null
* `userId`: string
* `createdAt`: number
* `updatedAt`: number

### 1.4 `mod_access_events` (Erişim Audit Geçmişi)
Erişim değişikliklerini izler:
* `id`: Firestore auto-generated ID
* `youtuberModAccessId`: string
* `modProjectId`: string
* `youtuberId`: string
* `eventType`: `'AUTO_GRANTED_FROM_VIDEO_ASSIGNMENT' | 'MANUAL_GRANTED' | 'MANUAL_REVOKED' | 'MANUAL_REGRANTED' | 'PLAYER_CHANGE_TRIGGERED_SYNC' | 'MANUAL_SYNC_REQUESTED'`
* `sourceVideoAssignmentId`: string | null
* `actorUserId`: string
* `metadata`: Record<string, unknown> (token/secret içermez)
* `createdAt`: number

### 1.5 `github_sync_jobs` (Kalıcı İş / Outbox Kuyruğu)
GitHub işlemlerini atomik ve güvenli işlemek için outbox modelini tutar:
* `id`: Firestore auto-generated ID
* `modProjectId`: string
* `status`: `'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'`
* `triggerType`: `'VIDEO_ASSIGNED' | 'MANUAL_ACCESS_GRANTED' | 'MANUAL_ACCESS_REVOKED' | 'PLAYER_ADDED' | 'PLAYER_UPDATED' | 'PLAYER_DEACTIVATED' | 'PLAYER_REMOVED' | 'MANUAL_RETRY' | 'MANUAL_SYNC' | 'DRIFT_REPAIR' | 'CRON_RETRY'`
* `attemptCount`: number
* `nextAttemptAt`: number
* `lockedAt`: number | null
* `lockedBy`: string | null
* `lastErrorCode`: string | null
* `lastErrorMessage`: string | null
* `userId`: string
* `createdAt`: number
* `startedAt`: number | null
* `completedAt`: number | null
* `updatedAt`: number

### 1.6 `github_sync_runs` (Senkronizasyon Çalışma Günlüğü)
Her GitHub güncelleme denemesinin ayrıntılı denetim kaydını tutar:
* `id`: Firestore auto-generated ID
* `modProjectId`: string
* `jobId`: string
* `status`: `'SUCCESS' | 'FAILED' | 'NO_OP' | 'NO_ACTIVE_PLAYERS'`
* `desiredUuidCount`: number
* `writtenUuidCount`: number
* `legacyUuidCount`: number
* `commitSha`: string | null
* `previousFileSha`: string | null
* `errorCode`: string | null
* `safeErrorMessage`: string | null
* `startedAt`: number
* `completedAt`: number

## 2. Sıfır Veri Kaybı Garantisi
* Mevcut `youtube_videos`, `assignments`, `records`, `youtubers`, `minecraft_players` ve `youtuber_minecraft_players` tablolarında hiçbir veri kaybı veya yıkıcı müdahale yapılmamıştır.
* Var olan video kayıtları mod bağlantısı olmadan sorunsuz çalışmaya devam eder.
* `firestore.rules` güncellenerek yeni koleksiyonlar için çoklu kiracı (tenant) güvenliği sağlanmıştır.
