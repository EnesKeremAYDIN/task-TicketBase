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
- `GET /api/tickets` — Ticket listesi (agent/admin, filtreli + sayfalı)
- `GET /api/tickets/:id` — Ticket detayı
- `PATCH /api/tickets/:id/status` — Durum güncelle (agent/admin)
- `POST /api/tickets/:id/claim` — Ticket üstlen (agent)
- `POST /api/tickets/:id/assign` — Ticket ata (admin)

### Comments
- `GET /api/tickets/:id/comments` — Yorum listesi
- `POST /api/tickets/:id/comments` — Yorum ekle

### SLA & Dashboard
- `GET /api/sla/dashboard` — Dashboard istatistikleri (agent/admin)
- `GET /api/sla/breaches` — SLA ihlal listesi (agent/admin)

### Diğer
- `GET /api/agents` — Ajan listesi (agent/admin)
- `GET /api/rules` — İşletim kuralları (admin)
- `POST /api/webhook/inbound-email` — Webhook (mock mail, `x-webhook-secret` header gerekli)

## Seed Verisi

- **4 tenant**: ACME Corp, Globex Corporation, Initech, Umbrella Inc
- **~20-30 kullanıcı**: 4 admin + ~12 agent + ~20 müşteri
- **100.000 ticket**: Tenant başına 25.000, rastgele durum/öncelik
- **400.000 yorum**: Tenant başına 100.000
- **SLA deadline'lar**: Tüm ticket'lar için hesaplanmış

## Test Sonuçları

### Birim Testleri (`npm test`) — 60/60 ✅

```
Test Files  5 passed (5)
     Tests  60 passed (60)
```

| Test Dosyası | Test Sayısı | Kapsam |
|-------------|-------------|--------|
| auth.test.ts | 10 | Login, token doğrulama, middleware |
| ticket.test.ts | 13 | CRUD, state machine, sequential number, claim/assign |
| sla.test.ts | 13 | Business hours, comments, dashboard |
| inbound-email.test.ts | 8 | Webhook, duplicate, validation |
| extended.test.ts | 16 | Cross-tenant, race, pagination, SLA boundary, search |

### Performans (`npm run perf`)
```
Ticket Listesi:
   Ortalama: 3.3ms
   P95: 4ms
   Durum: ✅ BAŞARILI (<300ms)

Dashboard:
   Ortalama: 59.0ms
   P95: 79ms
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
3. Rol bazlı yetkilendirme:   ✅ 3/3
4. Yorum görünürlüğü:        ✅ 1/1
Genel: ✅ 8/8 BAŞARILI (sıfır sızıntı)
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
