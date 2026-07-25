# TicketBase — Teslim Raporu

**Spec Referansı:** [TicketBase.md](./TicketBase.md) — ASEEK-01 Task Spec v2.0
**Proje Sürümü:** `main` (`45e0535`)
**Teslim Tarihi:** 2026-07-16

---

## 1. Amaç (TicketBase.md §1)

Spec'te belirtildiği gibi, Zammad/Jira benzeri multi-tenant IT destek/ticket sistemi geliştirildi.
4 tenant, 100k ticket ve 400k yorum içeren seed verisiyle birlikte çalışır durumdadır.

---

## 2. Çalışma Kuralları (TicketBase.md §2)

| Kural | Durum | Açıklama |
|-------|-------|----------|
| AI kullanımı serbest | ✅ | Tüm geliştirme boyunca AI asistandan faydalanıldı |
| AGENTS.md bağlayıcı | ✅ | Tüm kod yazımında AGENTS.md kuralları takip edildi |
| Commit disiplini | ✅ | 20 küçük mantıksal commit, squash yok |
| DECISIONS.md | ✅ | Tüm teknik kararlar kaydedildi |
| AI transkriptleri | ✅ | `/ai-transcripts/` klasöründe |
| QUESTIONS.md | ✅ | Boş bırakıldı (soru ihtiyacı oluşmadı) |

---

## 3. Alan Modeli (TicketBase.md §3)

Spec'te belirtilen tüm entity'ler `prisma/schema.prisma`'da tanımlandı:

| Entity | Spec | Uygulama |
|--------|------|----------|
| Tenant | Şirket, kendi kullanıcı/ticket/ayarları | ✅ `slug` unique, `name` |
| User | admin/agent/customer, tenant'a bağlı | ✅ `email` @unique (global), `role` |
| Ticket | displayId, status, priority, customer, agent | ✅ `@@unique([tenantId, number])`, index'ler |
| Comment | public_reply / internal_note | ✅ `type` ile ayrım, tenant scope'lu |
| TicketActivity | actor, source, field, old/new value, reason, visibility | ✅ Transaction içi immutable audit kaydı, tenant scope'lu |
| SLAPolicy | Öncelik bazlı SLA hedefleri | ✅ `@@unique([tenantId, priority])` |
| InboundMessage | Webhook mesaj kaydı, dedup ve retry | ✅ Nullable payload alanları, `messageId`/`dedupKey` unique, deneme ve hata bilgileri |
| Holiday | Tatil günleri | ✅ `@@unique([tenantId, date])` |

Durumlar: Rol duyarlı `new`, `open`, `pending`, `resolved`, `closed`; kontrollü yeniden açılma desteklenir
Öncelikler: `low`, `normal`, `high`, `urgent`

---

## 4. Fonksiyonel Gereksinimler (TicketBase.md §4)

### FR-01 — Kimlik ve Tenant Bağlamı

| İstek | Uygulama |
|-------|----------|
| E-posta + şifre girişi | `POST /api/auth/login` → `services/auth.ts:loginUser()` |
| Seed kullanıcılarıyla | 4 admin, 13 agent, 21 müşteri (şifre: 123456) |
| JWT ile session | `@fastify/jwt`, 7 gün expiry, `tenantId` + `role` payload'da |
| Tenant izolasyonu | Tüm sorgularda `tenantId` WHERE clause, `isolation-test` 9/9 |

### FR-02 — Ticket Yaşam Döngüsü

| İstek | Uygulama |
|-------|----------|
| Müşteri ticket açar (new) | `POST /api/tickets` → requireRole('customer') |
| State machine | Rol duyarlı; pending/resolved/closed durumlarından kontrollü yeniden açılma |
| Admin reopen | `closed → open`, neden zorunlu; ilk/son kapanma ve reopen sayısı korunur |
| Müşteri çözüm onayı | `resolved → closed` veya açıklamayla `resolved → open` |
| Pending reminder | Tarih ve neden zorunlu; süresi gelince veya müşteri yanıtlayınca `open` |
| Kapalı follow-up | Web/e-posta mesajı eski kayda bağlı yeni ticket oluşturur |
| Toplu ticket işlemleri | En fazla 100 seçili kayıt; durum, öncelik ve ajan işlemleri; kısmi başarı sonucu ve structured audit geçmişi |
| Bulk rol kuralları | Agent kendine atar; admin atar/atamayı kaldırır; state machine ve tenant kontrolleri korunur |
| Activity/audit trail | Durum, öncelik ve atama değişiklikleri actor, kaynak, eski/yeni değer ve zamanla kaydedilir |
| Sistem aktiviteleri | Pending reminder ve otomatik kapanma `actor=null`, `source=system` ile kaydedilir |
| Activity görünürlüğü | Agent/admin tüm olayları; müşteri yalnızca kendi ticket'ındaki public olayları, neden bilgisi olmadan görür |
| Geçersiz geçiş reddi | `validateTransition()` → rol ve durum kontrolüyle `ValidationError` |
| Ardışık benzersiz numara | `TicketCounter` tablosu, `$transaction` ile atomic increment |
| Race condition koruması | `race-test` → 20/20 benzersiz |

### FR-03 — Atama

| İstek | Uygulama |
|-------|----------|
| Agent üstlenme | `POST /api/tickets/:id/claim` → `updateMany` + status check |
| Admin atama | `POST /api/tickets/:id/assign` → agent validasyonu |
| Tek agent | `updateMany` ile row-level lock, double-claim testi |

### FR-04 — Yorumlar ve Görünürlük

| İstek | Uygulama |
|-------|----------|
| Agent public_reply/internal_note | `createComment()` → type validasyonu |
| Müşteri yalnızca public_reply | `ForbiddenError` internal_note yazmaya çalışırsa |
| Müşteri yalnızca public_reply görür | `getTicketComments()` → `where: { type: 'public_reply' }` |
| İlk agent public_reply firstResponseAt | `$transaction` ile atomik güncelleme; müşteri mesajı SLA'yı durdurmaz |
| Son aktivite | Her yorumda `lastActivityAt` güncellenir; otomatik kapanma bu alanı kullanır |

### FR-05 — E-posta Kanalı (Mock)

| İstek | Uygulama |
|-------|----------|
| Mock mail servisi | `src/mock-mail-channel/` → Fastify, port 4000 |
| Webhook endpoint | `POST /api/webhook/inbound-email`, `x-webhook-secret` ile korumalı |
| Konuda aktif numara varsa → yorum | Prefix ve numara birlikte ayrıştırılır; prefix tenant ile doğrulanır, pending/resolved ticket açılır |
| Konuda kapalı numara varsa → follow-up | Web akışıyla ortak `createFollowUpTicket()` servisi üzerinden bağlı yeni ticket oluşturulur |
| Konuda numara yoksa → yeni ticket | Transaction uyumlu ortak ticket servisine yönlendirme |
| Payload validasyonu | Zod schema: `messageId`, `tenant`, `from` (email), `body` (min 1) |
| Duplicate koruma | `messageId` veya ham payload hash'inden `dedupKey`; paralel isteklerde atomik sahiplenme |
| Yarım kalan işlem | Ticket/yorum ve `processed` güncellemesi aynı transaction'da; 24 saatlik pencerede eski `processing` kaydı 5 dakika sonra tekrar sahiplenilir |
| Bozuk payload loglama | Eksik kolonlar nullable; `status='failed'`, `raw`, `validationError` ve deneme bilgisi saklanır |

### FR-06 — SLA Takibi

| İstek | Uygulama |
|-------|----------|
| İlk yanıt + çözüm deadlines | `calculateSLADeadlines()` → `addBusinessMinutes()` |
| Mesai saatleri 09:00-18:00 | `business-hours.ts` → UTC+3, WORK_START:6, WORK_END:15 |
| Hafta sonu + tatil | `isWeekend()` + `isHoliday()` (seed'de 7 tatil/tenant) |
| SLA hedef tablosu | `SLAPolicy` seed: urgent(1s/8s), high(4s/24s), normal(8s/3gün), low(24s/5gün) |
| İlk yanıt ihlali | İlk agent/admin `public_reply` transaction'ında deadline karşılaştırması; müşteri yorumu ilk yanıt sayılmaz |
| Çözüm ihlali | `resolved` geçişi transaction'ında çözüm deadline karşılaştırması |
| İhlal türleri | `firstResponseSlaBreached` ve `resolutionSlaBreached`; `slaBreached` toplam/geriye uyumlu alan |
| Periyodik güvenlik ağı | `markBreachedTickets()` henüz yanıtlanmamış veya çözülmemiş aktif kayıtları tür bazında işaretler |
| Spec örneği doğrulandı | "Cuma 17:00 → Pazartesi 12:00" test edildi (sla.test.ts) |

### FR-07 — Listeler ve Dashboard

| İstek | Uygulama |
|-------|----------|
| Filtreler (durum/öncelik/atanan/kategori) | `listTickets()` → opsiyonel WHERE parametreleri |
| Arama | `title` + `description` `contains` |
| Sayfalama | `skip/take`, parametrik `page` + `limit` |
| Son yorum önizlemesi | Ayrı `findMany` + `distinct['ticketId']` ile |
| Dashboard (durum/öncelik/SLA/agent iş yükü) | `getDashboardStats()` → yalnızca `new`, `open`, `pending` kapsamlı paralel aggregate sorguları |
| Destek kuyrukları | `My Tickets` (agent), `Unassigned & Open` ve `Escalated` (agent/admin); mevcut filtre ve sayfalama ile birleşir |
| Akıcı çalışma (100k) | P95: list 6ms, dashboard 65ms |

### FR-08 — İşletim Kuralları Ekranı

| İstek | Uygulama |
|-------|----------|
| Admin görüntüleyebilir | `GET /api/rules` → requireRole(['admin']) |
| Düzenleme gerekmez | Sabit `OPERATING_RULES` array |
| 4 kural | auto-close 5gün, high 4s, mesai 09-18, webhook retry 24s |
| Frontend | TicketList sayfası altına entegre edildi |

### FR-09 — Türkçe Arayüz

| İstek | Uygulama |
|-------|----------|
| Arayüz dili Türkçe | Tüm UI metinleri, label'lar, butonlar Türkçe |
| Türkçe karakterler | ğ, ü, ş, ı, ö, ç doğru kullanıldı |
| Seed'de bozuk karakter yok | Tüm kullanıcı adları ve içerikler UTF-8 |

---

## 5. Fonksiyonel Olmayan Gereksinimler (TicketBase.md §5)

### NFR-01 — Performans

| İstek | Limit | Gerçek | Durum |
|-------|-------|--------|-------|
| Ticket listesi p95 | <300ms | **6ms** | ✅ |
| Dashboard p95 | <500ms | **65ms** | ✅ |
| `npm run perf` script'i | — | Mevcut | ✅ |

### NFR-02 — Eşzamanlılık

| İstek | Beklenen | Gerçek | Durum |
|-------|----------|--------|-------|
| 20 paralel ticket | 20 benzersiz | **20/20** | ✅ |
| 10 paralel üstlen | 1 başarılı | **1** | ✅ |

### NFR-03 — Tenant İzolasyonu

| Test | Beklenen | Gerçek | Durum |
|------|----------|--------|-------|
| Çapraz tenant erişim | 404 | **404** | ✅ |
| ID tahmini | 404 | **404** | ✅ |
| Müşteri yetki | 403 | **403** | ✅ |
| internal_note sızıntı | 403 | **403** | ✅ |
| **Sıfır sızıntı** | — | **9/9** | ✅ |

### NFR-04 — Kod Kalitesi

| İstek | Durum |
|-------|-------|
| TypeScript strict: true | ✅ `tsconfig.json`'da tanımlı |
| any kullanımı gerekçelendirilmeli | ✅ Minimal, tip dönüşümleri `as` ile |
| Birim testleri | ✅ **108 test** (SLA ihlal türleri, yanıtsız çözüm, dashboard/kuyruklar, activity/audit, bulk işlemler, yaşam döngüsü, state machine, numbering, kategori, webhook, visibility) |
| Lint temiz | ✅ `npm run lint` 0 hata |

### NFR-05 — Zaman Yönetimi

| İstek | Uygulama |
|-------|----------|
| UTC saklama | Tüm `DateTime` alanları UTC |
| Europe/Istanbul gösterim | `toLocaleDateString('tr-TR')` frontend'de |
| Yaz saati + tatil | `business-hours.ts` `% 24` normalize + holiday list |

---

## 6. Kilometre Taşları (TicketBase.md §6)

| Milestone | Açıklama | Commit'ler | Durum |
|-----------|----------|-----------|-------|
| **M1** — Analiz & Plan | Repo incelemesi, plan, veri modeli | `c7b4079` → `2d03d9a` | ✅ |
| **M2** — Çekirdek | Auth, ticket CRUD, state machine, race-test | `65992a1` → `4cb5b39` | ✅ |
| **M3** — Kanal & SLA & Performans | Webhook, SLA, perf/isolation-test | `9d0ee7b` → `1de37a6` | ✅ |
| **M4** — Teslim | Dashboard, frontend, testler, temizlik | `1e94280` → `45e0535` | ✅ |

---

## 7. Teslim Paketi (TicketBase.md §7)

| # | Öğe | Durum |
|---|-----|-------|
| 1 | Git repo (tüm commit geçmişiyle, squash yok) | ✅ Tüm commit geçmişi korunuyor |
| 2 | README.md (kurulum, çalıştırma, test sonuçları) | ✅ Güncellendi |
| 3 | DECISIONS.md + QUESTIONS.md | ✅ Mevcut |
| 4 | AI transkriptleri | ✅ `/ai-transcripts/` klasöründe |
| 5 | Demo videosu (opsiyonel) | X |

---

## 8. Test Özeti

| Test | Sonuç |
|------|-------|
| `npm run lint` | ✅ **0 hata** |
| `npm test` | ✅ **108/108 geçti** (9 dosya) |
| `npm run race-test` | ✅ 20/20 benzersiz, 1/10 claim |
| `npm run isolation-test` | ✅ 9/9 sıfır sızıntı |
| `npm run perf` | ✅ Liste P95: **6ms**, Dashboard P95: **65ms** |

---

## 9. Sonuç

Spec'te (TicketBase.md) belirtilen tüm fonksiyonel ve fonksiyonel olmayan gereksinimler karşılanmıştır.
Proje teslime hazırdır.
