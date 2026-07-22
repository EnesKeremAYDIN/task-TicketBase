# TicketBase — Görev Detay Özeti

> Kaynak: [docs/TicketBase.md](./TicketBase.md) — ASEEK-01 Task Spec v2.0

---

## 1. Proje Künyesi

| | |
|---|---|
| **Doküman** | ASEEK-01 Task Spec v2.0 |
| **Süre** | 12 iş günü (günde 3-4 saat) |
| **Stack** | TypeScript, React, Node.js (Fastify), Prisma, SQLite |
| **Amaç** | Zammad/Jira benzeri, birden çok şirketin (tenant) kendi IT destek süreçlerini yürüttüğü multi-tenant ticket sistemi |
| **Starter repo** | Proje iskeleti + eski geliştiriciden kalan modüller + 100k+ seed verisi + mock e-posta kanalı servisi |

---

## 2. Çalışma Kuralları

1. **AI kullanımı serbest ve teşvik edilir** — ChatGPT, Claude, Copilot, Cursor vb. yasak yok
2. **AGENTS.md bağlayıcıdır** — kendi kodun ve AI ajanların için
3. **Commit disiplini** — küçük, mantıksal, anlamlı mesajlı commit'ler zorunlu. Gün sonu tek dev commit yasak. Dil Türkçe/İngilizce, tutarlı olmalı
4. **DECISIONS.md** — repo kökünde karar günlüğü. Her teknik kararda: ne karar verdin, AI ne önerdi, neyi kabul/ret ettin, neden (3-5 satır)
5. **AI transkriptleri** — teslim paketinde AI konuşmalarının export'u veya paylaşım linkleri. "Az AI" değil, "iyi AI" puan getirir
6. **QUESTIONS.md** — belirsiz/çelişkili noktalar için soru dosyası. Cevap gelene kadar makul varsayımla ilerle, varsayımını DECISIONS.md'ye not et

---

## 3. Alan Modeli

| Entity | Detay |
|---|---|
| **Tenant** | Platformu kullanan şirket. Kendi kullanıcıları, ticket'ları, ayarları var. **Veri asla başka tenant'a görünmez** |
| **User** | Bir tenant'a bağlı. Roller: `admin`, `agent` (destek), `customer` (talep açan) |
| **Ticket** | Talep kaydı. Alanlar: tenant içi ardışık numara (`ACME-1042`), başlık, açıklama, durum, öncelik, kategori, açan müşteri, atanan agent, zaman damgaları |
| **→ Durumlar** | `new` → `open` → `pending` → `resolved` → `closed` |
| **→ Öncelikler** | `low`, `normal`, `high`, `urgent` |
| **Comment** | İki tür: `public_reply` (müşteri görür) ve `internal_note` (sadece agent/admin) |
| **SLA Policy** | Önceliğe göre ilk yanıt ve çözüm süresi hedefleri (tenant başına, seed'de hazır) |
| **InboundMessage** | Mock e-posta kanalından gelen ham mesaj kaydı |

**Seed verisi:** 4 tenant, tenant başına 5-15 kullanıcı, ~100.000 ticket, ~400.000 yorum

---

## 4. Fonksiyonel Gereksinimler

### FR-01 — Kimlik ve Tenant Bağlamı
- E-posta + şifre girişi (seed kullanıcılarıyla, kayıt akışı gerekmez)
- Oturumdaki kullanıcının tenant'ı ve rolü tüm isteklerde bağlayıcı
- **Mutlak tenant izolasyonu:** listeler, detaylar, sayaçlar, aramalar, ID tahminiyle erişim dahil hiçbir endpoint başka tenant verisi döndüremez

### FR-02 — Ticket Yaşam Döngüsü
- Müşteri → `new` açar; agent yanıtlayınca → `open`; bilgi bekleniyorsa → `pending`; çözüm sonrası → `resolved`; müşteri onayı veya 5 gün hareketsizlik → `closed`
- Geçersiz durum geçişleri reddedilir (örn. `closed` → `pending`)
- Açılış anında tenant içinde ardışık benzersiz numara (`ACME-1`, `ACME-2`...)
- Atlama kabul edilir, **çakışma (duplicate) kabul edilmez** — eşzamanlı açılışta dahi (NFR-02)

### FR-03 — Atama
- Agent, atanmamış ticket'ı "üstlen" butonuyla kendine alabilir
- Admin herhangi bir agent'a atayabilir
- Aynı anda **tek** agent'a atanmış olabilir
- İki agent aynı anda üstlenirse yalnızca biri başarılı (NFR-02)

### FR-04 — Yorumlar ve Görünürlük
- Agent: `public_reply` veya `internal_note` yazabilir
- Müşteri: yalnızca `public_reply` yazabilir ve **yalnızca** `public_reply` görebilir
- İlk `public_reply`, SLA "ilk yanıt" saatini durdurur

### FR-05 — E-posta Kanalı (Mock)
- `mock-mail-channel` servisi webhook gönderir (API sözleşmesi kendi README'sinde)
- Her zaman ideal payload göndermeyebilir (edge case'lere hazırlıklı ol)
- Konuda ticket numarası varsa → yorum olarak ekle
- Konuda ticket numarası yoksa → yeni ticket aç
- **Gelen her veri doğrulanmalı** — bozuk payload sistemi düşürmemeli, kayıt altına alınmalı
- **Duplicate teslim önlenmeli** — aynı mesaj iki kez işlenemez

### FR-06 — SLA Takibi
- Her ticket için önceliğe göre ilk yanıt ve çözüm son tarihleri hesaplanır
- SLA süreleri **mesai saatleri** üzerinden işler: hafta içi 09:00-18:00 (`Europe/Istanbul`)
- Hafta sonu ve resmi tatiller (seed'de tatil tablosu) sayılmaz
- Örn: Cuma 17:00'de açılan `high` ticket'ın 4 saatlik ilk yanıt hedefi Pazartesi 12:00'dir
- Süre geçen ticket'lar `sla_breached` işaretlenir ve dashboard'da listelenir
- Önceki geliştiriciden kalan mesai-saati hesaplayıcısı var; kullanmak/değiştirmek sana kalmış

**SLA Hedefleri (seed varsayılanı, tüm tenant'lar):**

| Öncelik | İlk Yanıt | Çözüm |
|---|---|---|
| urgent | 1 saat | 8 saat |
| high | 4 saat | 24 saat |
| normal | 8 saat | 3 iş günü |
| low | 24 saat | 5 iş günü |

### FR-07 — Listeler ve Dashboard
- **Agent görünümü:** tenant ticket listesi; durum/öncelik/atanan/kategori filtreleri, arama, sayfalama, son yorum önizlemesi
- **Dashboard:** açık ticket sayıları (durum + öncelik kırılımı), SLA ihlalleri, agent başına açık iş yükü
- 100k seed verisiyle **akıcı** çalışmalı (NFR-01)

### FR-08 — İşletim Kuralları Ekranı
- Admin görüntüleyebilir, düzenleme gerekmez (sabit config yeterli)

| Kural | Değer |
|---|---|
| Otomatik kapanma (resolved → closed) | 5 gün hareketsizlik |
| `high` önceliğin ilk yanıt hedefi | 4 saat |
| Mesai saatleri | Hafta içi 09:00-18:00 |
| Webhook yeniden deneme penceresi | 24 saat |

### FR-09 — Türkçe Arayüz
- Tüm arayüz Türkçe
- Türkçe karakterler doğru kullanılmalı (AGENTS.md §9)
- Seed verisindeki kullanıcı adları ve ticket içerikleri dahil **hiçbir yerde bozuk karakter olmayacak**

---

## 5. Fonksiyonel Olmayan Gereksinimler

### NFR-01 — Performans
- Ticket liste endpoint'i (filtreli + sayfalı), seed verisi yüklüyken → **p95 < 300 ms**
- Dashboard endpoint'i seed verisiyle → **p95 < 500 ms**
- `npm run perf` ile ölçülür; sonuç README'ye eklenir

### NFR-02 — Eşzamanlılık
- `npm run race-test`: aynı tenant için 20 paralel ticket oluşturma → 20 ticket, **20 benzersiz ardışık** numara
- Aynı ticket'ı 10 paralel "üstlen" isteği → yalnızca **1 başarılı**
- **Teslim kriteridir**

### NFR-03 — Tenant İzolasyonu ve Yetki
- `npm run isolation-test`: farklı tenant kullanıcılarıyla çapraz erişim dener (liste, detay, ID tahmini, arama)
- Müşteri rolüyle `internal_note` okumaya çalışır
- **Sıfır sızıntı** — teslim kriteridir

### NFR-04 — Kod Kalitesi
- TypeScript `strict: true`
- `any` kullanımı gerekçelendirilmedikçe kabul edilmez
- Birim testleri zorunlu: durum makinesi, numara üretimi, SLA hesabı, webhook işleme, görünürlük kuralları
- UI testi zorunlu değil
- `npm run lint` temiz geçmeli

### NFR-05 — Zaman Yönetimi
- Tüm zamanlar DB'de **UTC** saklanır
- Arayüzde `Europe/Istanbul` gösterilir
- SLA hesabı yaz saati geçişleri ve tatil sınırlarında doğru çalışmalı

---

## 6. Kilometre Taşları

| Gün | Milestone | Beklenen |
|---|---|---|
| 1-2 | **M1 — Analiz & Plan** | Repo incelemesi, QUESTIONS.md, teknik plan (DECISIONS.md), veri modeli onayı |
| 3-5 | **M2 — Çekirdek** | Kimlik/tenant bağlamı, ticket CRUD + state machine + numara üretimi (`race-test` yeşil), izolasyon temeli |
| 6-9 | **M3 — Kanal & SLA & Performans** | E-posta webhook uçtan uca, SLA hesabı + ihlal listesi, `perf` + `isolation-test` yeşil |
| 10-12 | **M4 — Teslim** | Dashboard, yorum görünürlüğü, testler, temizlik, teslim paketi |

Her milestone sonunda **2-3 cümle** durum bildirimi zorunlu.

---

## 7. Teslim Paketi

1. **Git repo** — tüm commit geçmişiyle, squash yasak
2. **README.md** — kurulum, çalıştırma, perf/race/isolation test sonuçları
3. **DECISIONS.md** + **QUESTIONS.md** — repo kökünde
4. **AI transkriptleri** — `/ai-transcripts` klasörü (export dosyaları veya link listesi)
5. **Demo videosu** — 5 dk, ekran kaydı, opsiyonel ama önerilir

---

## 8. Değerlendirme

**İki eksende değerlendirilir:**

### Eksen 1 — Mühendislik Kalitesi
- Gereksinim analizi (spec'i anlama ve uygulama)
- Doğruluk (tüm FR'ler çalışıyor, edge case'ler düşünülmüş)
- Güvenlik/izolasyon (NFR-03 sıfır sızıntı, NFR-02 race condition)
- Kod kalitesi (NFR-04: strict TS, test, lint)
- Performans (NFR-01: p95 süreleri)
- Commit disiplini (küçük mantıksal commit'ler, gün sonu dev commit yasak)

### Eksen 2 — AI Kullanım Kalitesi
- Prompt'larının kalitesi
- AI çıktısını doğrulama biçimin (körü körüne kabul etmemen)
- Hangi AI önerilerini kabul/ret ettiğin ve neden
- Kodunu savunabilmen

**Teslim sonrası:** ~30 dakikalık teknik sohbet — kodundan seçilen bölümleri açıklaman istenecek.

---

> Başarılar. Soruların için QUESTIONS.md'yi kullan — soru sormak puan kırdırmaz.
