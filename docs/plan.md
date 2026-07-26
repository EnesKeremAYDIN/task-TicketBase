# 🗺️ TicketBase — Geliştirme Planı

> Kaynak: [TicketBase.md](./TicketBase.md)

---

## 📌 Not: Starter Repo Eksik
Verilen spec'te starter repo'dan bahsediliyor ancak teslim edilmedi. Mock mail channel, seed verisi, mesai hesaplayıcı ve tüm kod sıfırdan oluşturulacak. (Bkz. DECISIONS.md)

---

## Aşama 1 — Proje İskeleti & Veri Modeli

- [ ] `package.json` oluştur (TypeScript, React, Fastify, Prisma, SQLite, ESLint)
- [ ] `tsconfig.json` (`strict: true`)
- [ ] Dizin yapısını kur: `src/backend/`, `src/frontend/`, `prisma/`, `mock-mail-channel/`, `ai-transcripts/`
- [ ] `.gitignore`, `.env` dosyalarını oluştur
- [ ] Prisma şemasını yaz (6 entity):
  - Tenant, User, Ticket, Comment, TicketActivity, SLAPolicy, InboundMessage, Holiday
  - Unique constraint'ler, index'ler, tenant_id foreign key'leri
- [ ] Seed script'i yaz: 4 tenant, her tenant'ta 5-15 kullanıcı, ~100k ticket, ~400k yorum
- [ ] `npm run lint` script'ini ekle

---

## Aşama 2 — Kimlik & Tenant İzolasyonu

- [ ] Fastify sunucu kurulumu, middleware zinciri
- [ ] Login endpoint'i (e-posta + şifre, seed kullanıcılarıyla)
- [ ] JWT token ile session yönetimi
- [ ] Auth middleware: her istekte tenant_id ve role'ü çözümle
- [ ] Tenant izolasyon katmanı: tüm DB sorgularında tenant_id filtrelemesi zorunlu kıl
- [ ] ID tahmini koruması: kaynak tenant_id'si ile istek tenant_id'sini karşılaştır

---

## Aşama 3 — Ticket CRUD + State Machine + Atama

- [ ] Ticket oluşturma endpoint'i (müşteri → `new`)
- [ ] Rol duyarlı state machine: pending/resolved/closed durumlarından kontrollü yeniden açılma
- [ ] Geçersiz geçişleri reddeden state validator
- [ ] Mevcut sayfayla sınırlı toplu durum, öncelik ve ajan işlemleri
- [ ] Tenant içi ardışık benzersiz numara üretimi (`ACME-1`, `ACME-2`...)
  - Transaction + unique constraint ile race condition koruması
- [ ] Ticket listeleme: durum/öncelik/atanan/kategori filtreleri, arama, sayfalama, son yorum önizlemesi
- [ ] Ticket detay endpoint'i
- [ ] Sayfalı ve rol kontrollü ticket activity/audit endpoint'i
- [ ] "Üstlen" endpoint'i (row-level lock ile tek başarılı atama)
- [ ] Admin atama endpoint'i
- [ ] **`npm run race-test` script'ini yaz ve yeşil yap**
  - 20 paralel ticket oluştur → 20 benzersiz numara
  - 10 paralel üstlen → 1 başarılı
- [ ] **`npm run isolation-test` script'ini yaz ve yeşil yap**
  - Çapraz tenant erişim denemeleri, ID tahmini, internal_note sızıntısı

---

## Aşama 4 — Mock E-posta Kanalı

- [ ] `mock-mail-channel` servisini oluştur (webhook gönderen simülatör)
- [x] Webhook alıcı endpoint: payload doğrulama
- [x] Konu satırında tenant prefix'i doğrulanmış ticket numarası varsa → Comment olarak ekle
- [x] Konu satırında ticket numarası yoksa → yeni Ticket oluştur
- [x] Duplicate ve yarım kalan işlem koruması: `messageId` veya ham payload hash'iyle atomik sahiplenme
- [x] Hatalı/bozuk payload'ları nullable alanlar, ham içerik ve doğrulama hatasıyla `InboundMessage` olarak logla

---

## Aşama 5 — SLA Takibi

- [ ] Business hour calculator: hafta içi 09:00-18:00, `Europe/Istanbul`
- [ ] Tatil tablosu entegrasyonu (seed'deki holiday verisiyle)
- [ ] SLA deadline hesaplama (ilk yanıt + çözüm) — yaz saati geçişleri dahil
- [ ] SLA hedefleri: urgent(1s/8s), high(4s/24s), normal(8s/3gün), low(24s/5gün)
- [ ] İlk yanıt ve çözüm SLA ihlallerini ayrı işaretleme; toplam ihlal alanını uyumlu tutma
- [ ] İlk agent/admin `public_reply` sırasında ilk yanıt ihlalini atomik hesaplama; müşteri yorumunu ilk yanıt saymama
- [ ] `resolved` geçişinde çözüm ihlalini atomik hesaplama
- [ ] Periyodik SLA taramasını olay anındaki hesaplamalara güvenlik ağı olarak çalıştırma

---

## Aşama 6 — Frontend (React)

- [x] Vite + React + ayrı strict TypeScript kontrolü
- [x] Login sayfası (Türkçe arayüz)
- [x] Ticket listesi sayfası: URL tabanlı filtreler, debounce arama, sayfalama, kategori ve son yorum önizlemesi
- [x] Ticket detay sayfası: yorum geçmişi, yorum yazma (public_reply/internal_note ayrımı)
- [x] Ticket detay sayfası: durum, öncelik, atama ve sistem olayları için aktivite zaman çizelgesi
- [x] Dashboard: açık ticket sayıları (durum/öncelik kırılımı), SLA ihlalleri, agent başına iş yükü
- [x] Dashboard sorgularını aktif durumlarla (`new`, `open`, `pending`) sınırla
- [x] Agent için `My Tickets`, destek ekibi için `Unassigned & Open` ve `Escalated` kuyruklarını ekle
- [x] Kuyruk yetkilerini, mevcut filtrelerle uyumu ve aktif dashboard kapsamını izole testlerle doğrula
- [x] Dashboard, ticket listesi ve admin İşletim Kuralları için ayrı sayfa yapısı
- [x] İşletim Kuralları sayfası (sabit config: 5 gün kapanma, 4 saat high hedefi, 09-18 mesai, 24s webhook retry)
- [x] Responsive navigasyon, filtreler, tablolar ve erişilebilir modal davranışı
- [x] Yorum görünürlük: müşteri sadece public_reply görür, agent/admin ikisini de görür
- [x] Tüm UI metinleri Türkçe, Türkçe karakterler doğru kullanılacak
- [x] Tenant bazlı hazır yanıt yönetimi ve ticket yorum alanı entegrasyonu
- [x] Yorum, durum, öncelik ve kendime atama aksiyonlu makro yönetimi
- [x] Makroları tek transaction içinde state machine, SLA ve audit kurallarıyla uygulama
- [x] Hazır yanıt/makro yetkileri, tenant izolasyonu ve rollback testleri

---

## Aşama 7 — Performans & Testler

- [ ] Ticket listesi endpoint optimizasyonu: Prisma select only, index'ler, pagination → **p95 < 300ms**
- [ ] Dashboard endpoint optimizasyonu: aggregate sorgular → **p95 < 500ms**
- [ ] **`npm run perf` script'ini yaz**
- [ ] Birim testleri:
  - State machine geçiş kuralları
  - Numara üretimi (race condition dahil)
  - SLA hesaplama (mesai, tatil, yaz saati)
  - Webhook işleme (doğrulama, duplicate koruma)
  - Yorum görünürlük kuralları
- [x] React component testleri: modal erişilebilirliği ve hata tekrar deneme akışı
- [x] İzole SQLite veritabanlı Playwright E2E test altyapısı
- [x] Rol, customer ticket, admin lifecycle, agent workflow, URL filtreleri ve mobil görünüm E2E senaryoları

---

## Aşama 8 — Teslim Paketi

- [ ] `npm run lint` temiz geçtiğini doğrula
- [ ] README.md'yi güncelle: kurulum, çalıştırma, perf/race/isolation test sonuçları
- [ ] DECISIONS.md'yi tüm kararlarla güncelle
- [ ] AI transkriptlerini `/ai-transcripts/` klasörüne ekle
- [ ] Commit geçmişini kontrol et (küçük mantıksal commit'ler, squash yok)
- [ ] Demo videosu (opsiyonel)
