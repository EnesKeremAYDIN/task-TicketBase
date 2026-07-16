# TicketBase — Multi-Tenant IT Destek Sistemi

Zammad/Jira benzeri, birden fazla şirketin (tenant) aynı platform üzerinden kendi IT destek süreçlerini yürüttüğü multi-tenant ticket sistemi.

## Tech Stack

| Katman | Teknoloji |
|---|---|
| Dil | TypeScript (`strict: true`) |
| Frontend | React |
| Backend | Node.js, Fastify |
| ORM | Prisma |
| Veritabanı | SQLite |
| Arayüz Dili | Türkçe |

## Proje Yapısı

```
├── AGENTS.md              # AI ajan çalışma kuralları
├── DECISIONS.md           # Teknik karar günlüğü
├── QUESTIONS.md           # Sorular
├── docs/                  # Dokümantasyon
│   ├── TicketBase.md      # Görev spec'i
│   └── details.md         # Görev detay özeti
├── prisma/
│   └── schema.prisma      # Veri modeli
├── mock-mail-channel/     # Mock e-posta kanalı servisi
├── src/
│   ├── frontend/          # React uygulaması
│   └── backend/           # Fastify sunucusu
├── ai-transcripts/        # AI konuşma kayıtları
└── package.json
```

## Kurulum

*(Proje geliştirme aşamasında — kurulum adımları eklenecek.)*

```bash
# Örnek:
git clone <repo-url>
cd task-TicketBase
npm install
npm run dev
```

## Kullanılabilir Scriptler

| Script | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır |
| `npm run build` | Production build alır |
| `npm run lint` | Lint kontrolü (temiz geçmeli) |
| `npm run perf` | Performans testi (p95 < 300ms list, < 500ms dashboard) |
| `npm run race-test` | Eşzamanlılık testi (20 paralel ticket, 10 paralel üstlen) |
| `npm run isolation-test` | Tenant izolasyon testi (sıfır sızıntı) |

## Test Sonuçları

### Performans (`npm run perf`)
```
— Teslim sırasında eklenecek —
```

### Eşzamanlılık (`npm run race-test`)
```
— Teslim sırasında eklenecek —
```

### Tenant İzolasyonu (`npm run isolation-test`)
```
— Teslim sırasında eklenecek —
```

## Seed Verisi

- 4 tenant
- Tenant başına 5-15 kullanıcı
- ~100.000 ticket
- ~400.000 yorum

## Lisans

—
