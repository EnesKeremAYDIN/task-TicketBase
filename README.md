# TicketBase — Multi-Tenant IT Destek Sistemi

Zammad/Jira benzeri, birden fazla şirketin (tenant) aynı platform üzerinden kendi IT destek süreçlerini yürüttüğü multi-tenant ticket sistemi.

## Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Dil | TypeScript (`strict: true`) |
| Frontend | React 19, Vite 6, React Router 7 |
| Backend | Node.js, Fastify 5 |
| ORM | Prisma 6 |
| Veritabanı | SQLite |
| Arayüz Dili | Türkçe |
| Test | Vitest |

## Proje Yapısı

```
├── AGENTS.md              # AI ajan çalışma kuralları
├── DECISIONS.md           # Teknik karar günlüğü
├── QUESTIONS.md           # Sorular
├── docs/
│   ├── TicketBase.md      # Görev spec'i
│   ├── details.md         # Görev detay özeti
│   ├── plan.md            # Geliştirme planı
│   └── users.md           # Kullanıcı hesap listesi
├── prisma/
│   ├── schema.prisma      # Veri modeli
│   └── seed.ts            # Seed verisi oluşturucu
├── src/
│   ├── backend/           # Fastify sunucusu (routes, services, middleware)
│   ├── frontend/          # React uygulaması (pages, components, lib)
│   ├── mock-mail-channel/ # Mock e-posta kanalı servisi
│   └── tests/             # Test dosyaları
├── ai-transcripts/        # AI konuşma kayıtları
└── package.json
```

## Hızlı Başlangıç

```bash
# Bağımlılıkları yükle
npm install

# Veritabanını oluştur ve seed verisiyle doldur
npm run db:reset

# Geliştirme sunucularını başlat (backend + frontend + mock mail)
npm run dev
```

Sunucular başladığında:

| Servis | Adres |
|--------|-------|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Mock Mail Channel | http://localhost:4000 |

## Kullanıcı Hesapları

Tüm hesapların şifresi: `123456`

### Admin

| İsim | E-posta | Tenant |
|------|---------|--------|
| ACME Corp Admin | admin@acme.com | ACME Corp |
| Globex Corporation Admin | admin@globex.com | Globex Corporation |
| Initech Admin | admin@initech.com | Initech |
| Umbrella Inc Admin | admin@umbrella.com | Umbrella Inc |

### Agent

| İsim | E-posta | Tenant |
|------|---------|--------|
| ACME Corp Ajan 1 | agent1@acme.com | ACME Corp |
| ACME Corp Ajan 2 | agent2@acme.com | ACME Corp |
| Globex Corporation Ajan 1 | agent1@globex.com | Globex Corporation |
| Globex Corporation Ajan 2 | agent2@globex.com | Globex Corporation |
| Globex Corporation Ajan 3 | agent3@globex.com | Globex Corporation |
| Globex Corporation Ajan 4 | agent4@globex.com | Globex Corporation |
| Initech Ajan 1 | agent1@initech.com | Initech |
| Initech Ajan 2 | agent2@initech.com | Initech |
| Initech Ajan 3 | agent3@initech.com | Initech |
| Initech Ajan 4 | agent4@initech.com | Initech |
| Umbrella Inc Ajan 1 | agent1@umbrella.com | Umbrella Inc |
| Umbrella Inc Ajan 2 | agent2@umbrella.com | Umbrella Inc |
| Umbrella Inc Ajan 3 | agent3@umbrella.com | Umbrella Inc |

Detaylı müşteri listesi için: [docs/users.md](docs/users.md)

## Kullanılabilir Scriptler

| Script | Açıklama |
|--------|----------|
| `npm run dev` | Tüm geliştirme sunucularını başlatır |
| `npm run dev:backend` | Sadece backend sunucusu |
| `npm run dev:frontend` | Sadece frontend (Vite) |
| `npm run dev:mock` | Sadece mock mail kanalı |
| `npm run build` | Production build |
| `npm run typecheck:frontend` | Frontend strict TypeScript kontrolü |
| `npm run lint` | ESLint kontrolü |
| `npm test` | Birim testleri (Vitest) |
| `npm run perf` | Performans testi |
| `npm run race-test` | Eşzamanlılık testi |
| `npm run isolation-test` | Tenant izolasyon testi |
| `npm run db:reset` | DB sıfırla + seed verisini oluştur |
| `npm run db:seed` | Sadece seed verisini oluştur |

## API Endpoint'leri

### Auth
- `POST /api/auth/login` — Giriş yap (5 istek/dk rate limit)

### Tickets
- `POST /api/tickets` — Ticket oluştur (müşteri)
- `GET /api/tickets` — Ticket listesi (agent/admin için tenant geneli, müşteri için yalnızca kendi ticket'ları; filtreli + sayfalı). Destek ekibi `queue=my|unassigned|escalated` parametresiyle aktif iş kuyruklarını açabilir; `my` yalnızca agent rolünde kullanılabilir.
- `GET /api/ticket-categories` — Tenant'ta kullanılan ticket kategorileri
- `GET /api/tickets/:id` — Ticket detayı
- `GET /api/tickets/:id/activities` — Sayfalı ticket aktivite geçmişi (müşteri için yalnızca public kayıtlar)
- `POST /api/tickets/bulk` — En fazla 100 seçili ticket üzerinde durum, öncelik veya ajan işlemi (agent/admin)
- `PATCH /api/tickets/:id/status` — Rol duyarlı durum güncelleme (agent/admin)
- `POST /api/tickets/:id/confirm-resolution` — Çözümü onayla ve kapat (ticket sahibi müşteri)
- `POST /api/tickets/:id/reject-resolution` — Çözümü reddet ve yeniden aç (ticket sahibi müşteri)
- `POST /api/tickets/:id/follow-up` — Kapalı ticket'a bağlı yeni takip ticket'ı oluştur (ticket sahibi müşteri)
- `POST /api/tickets/:id/claim` — Ticket üstlen (agent)
- `POST /api/tickets/:id/assign` — Ticket ata (admin)

### Comments
- `GET /api/tickets/:id/comments` — Yorum listesi
- `POST /api/tickets/:id/comments` — Yorum ekle

### SLA & Dashboard
- `GET /api/sla/dashboard` — Yalnızca aktif (`new`, `open`, `pending`) ticketları kapsayan dashboard, ilk yanıt/çözüm ihlal dağılımı ve kuyruk sayaçları (agent/admin)
- `GET /api/sla/breaches` — SLA ihlal listesi (agent/admin)

### Diğer
- `GET /api/agents` — Ajan listesi (agent/admin)
- `GET /api/rules` — İşletim kuralları (admin)
- `GET/POST/PATCH /api/canned-responses` — Tenant bazlı hazır yanıt listeleme ve admin yönetimi
- `GET/POST/PATCH /api/macros` — Tenant bazlı makro listeleme ve admin yönetimi
- `POST /api/tickets/:ticketId/macros/:macroId/apply` — Makroyu ticket üzerinde atomik uygulama (agent/admin)
- `POST /api/webhook/inbound-email` — Webhook (mock mail, `x-webhook-secret` header gerekli). Bozuk payload'lar ham içerik ve doğrulama hatasıyla kaydedilir; ticket prefix'i tenant ile doğrulanır.

Webhook işlemleri `InboundMessage` üzerinde `processing`, `processed` ve `failed` durumlarıyla izlenir. Ticket/yorum oluşturma ile mesajın tamamlanması aynı transaction içinde yapılır. Yarım kalan `processing` kaydı, 24 saatlik retry penceresi içinde 5 dakikalık sahiplik süresi dolduktan sonra aynı `messageId` ile güvenli biçimde yeniden denenebilir.

## Frontend Yapısı

- Dashboard, ticket listesi ve admin işletim kuralları ayrı sayfalardır.
- Ticket listesi filtreleri, arama, kuyruk ve sayfalama URL parametrelerinde tutulur; görünüm yenilenebilir ve paylaşılabilir.
- Arama isteği 350 ms debounce ile gönderilir.
- Mobil görünümde navigasyon, filtreler, tablolar ve modallar responsive çalışır.
- Modallar Escape ile kapanır, odağı içeride tutar ve kapanınca önceki odağa döner.
- API yükleme hataları ilgili bölümde görünür ve tekrar deneme seçeneği sunar.
- Production build, backend kontrolüne ek olarak ayrı frontend strict TypeScript kontrolünü de çalıştırır.
- Admin, `/automations` sayfasından hazır yanıt ve makroları oluşturabilir, düzenleyebilir veya pasife alabilir.
- Agent hazır yanıtı yorum alanına aktararak göndermeden önce düzenleyebilir.
- Makrolar yorum, durum, öncelik ve kendime atama işlemlerini tek transaction içinde uygular; başarısızlıkta bütün işlemler geri alınır.

## Seed Verisi

- **4 tenant**: ACME Corp, Globex Corporation, Initech, Umbrella Inc
- **38 sabit kullanıcı**: 4 admin + 13 agent + 21 müşteri
- **100.000 ticket**: Tenant başına 25.000; durum, öncelik ve kategori dağılımı deterministik
- **400.000 yorum**: Tenant başına 100.000; dağılımı deterministik
- **341.537 deterministik aktivite**: Oluşturma, durum ve atama olayları ticket başına sorgu olmadan toplu üretilir
- **7 kategori**: Donanım, Yazılım, Ağ, Erişim, E-posta, Güvenlik, Diğer
- **12 hazır yanıt ve 8 makro**: Her tenant için 3 hazır yanıt ve 2 operasyon makrosu
- **Yaşam döngüsü örnekleri**: Pending reminder ve yeniden açılma geçmişi bulunan ticket'lar
- **SLA deadline'ları**: Veritabanına yazılmadan önce bellekte hesaplanır
- **SLA ihlal türleri**: İlk yanıt ve çözüm ihlalleri ayrı, toplam ihlal alanıyla uyumlu ve deterministik üretilir
- **Tekrarlanabilir sonuç**: Seed anahtarı `20260722`; aynı komut aynı kullanıcıları ve içerik dağılımını üretir
- **Ölçülen `db:reset` süresi**: 65–85 saniye (iki yerel doğrulama çalışması)

## Test Sonuçları

### Birim Testleri (`npm test`) — 116/116 ✅

```
Test Files  10 passed (10)
     Tests  116 passed (116)
```

| Test Dosyası | Test Sayısı | Kapsam |
|-------------|-------------|--------|
| auth.test.ts | 10 | Login, token doğrulama, middleware |
| ticket.test.ts | 16 | CRUD, kategori filtresi, müşteri liste izolasyonu, yorum görünürlüğü, state machine, sequential number, claim/assign |
| sla.test.ts | 19 | Business hours, SLA policy, geç/yanıtsız ilk yanıt, geç çözüm ihlalleri, tür ayrımı, comments ve dashboard |
| lifecycle.test.ts | 10 | Admin reopen, müşteri çözüm onayı/reddi, pending reminder, follow-up ve gerçek hareketsizliğe göre otomatik kapanma |
| bulk-ticket.test.ts | 9 | Rol yetkileri, state machine, SLA yeniden hesaplama, ajan atama, tenant izolasyonu, 100 kayıt limiti |
| activity.test.ts | 8 | Actor/zaman, eski-yeni değer, görünürlük, otomatik işlemler, tenant izolasyonu |
| queue.test.ts | 9 | Aktif dashboard kapsamı, My Tickets, Unassigned & Open, Escalated, rol yetkileri ve filtre uyumu |
| inbound-email.test.ts | 11 | Webhook, bozuk payload kaydı, tenant prefix kontrolü, duplicate ve yarım kalan işlem retry akışı |
| extended.test.ts | 16 | Cross-tenant, race, pagination, SLA boundary, search |
| automation.test.ts | 8 | Hazır yanıt/makro yetkileri, tenant izolasyonu, şablon güvenliği, atomik uygulama ve rollback |

### Performans (`npm run perf`)
```
Ticket Listesi:
   Ortalama: 3.9ms
   P95: 6ms
   Durum: ✅ BAŞARILI (<300ms)

Dashboard:
   Ortalama: 50.7ms
   P95: 65ms
   Durum: ✅ BAŞARILI (<500ms)
```

### Eşzamanlılık (`npm run race-test`)
```
1. Test: 20 paralel ticket oluşturma...
   Başarılı: 20, Başarısız: 0
   Benzersiz numara: 20/20
   Sonuç: ✅ BAŞARILI

2. Test: 10 paralel üstlenme (aynı ticket)...
   Başarılı üstlenme: 1
   Sonuç: ✅ BAŞARILI
```

### Tenant İzolasyonu (`npm run isolation-test`)
```
1. Çapraz tenant erişim:     ✅ 3/3
2. ID tahmini koruması:       ✅ 1/1
3. Rol bazlı yetkilendirme:   ✅ 4/4
4. Yorum görünürlüğü:        ✅ 1/1
Genel: ✅ 9/9 BAŞARILI (sıfır sızıntı)
```

### Kod Kalitesi (`npm run lint`)
```
✅ Temiz geçti (0 hata, 0 uyarı)
```

## Ortam Değişkenleri

`.env` dosyasında tanımlıdır:

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `DATABASE_URL` | `file:./dev.db` | SQLite veritabanı yolu |
| `JWT_SECRET` | `ticketbase-dev-secret-...` | JWT imzalama anahtarı |
| `WEBHOOK_SECRET` | `ticketbase-webhook-secret` | Webhook doğrulama anahtarı |
| `PORT` | `3000` | Backend portu |
| `FRONTEND_PORT` | `5173` | Frontend portu |
| `MOCK_MAIL_PORT` | `4000` | Mock mail portu |
| `BACKEND_URL` | `http://localhost:3000` | Backend adresi (mock mail için) |
