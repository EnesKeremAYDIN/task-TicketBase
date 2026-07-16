# TicketBase — Multi-Tenant IT Destek Sistemi
## Geliştirme Görevi Tanımı

| | |
|---|---|
| **Doküman** | ASEEK-01 Task Spec |
| **Versiyon** | 2.0 |
| **Hedef süre** | 12 iş günü (günde 3-4 saat) |
| **Stack** | TypeScript, React, Node.js (Fastify), Prisma, SQLite |

---

## 1. Amaç

Birden fazla şirketin (tenant) aynı platform üzerinden kendi IT destek süreçlerini yürüttüğü, Zammad/Jira benzeri bir **multi-tenant destek/ticket sistemi** geliştireceksin. Sana bir **starter repo** verilecek: proje iskeleti, önceki bir geliştiriciden kalan bazı modüller, 100k+ kayıtlık seed verisi ve sahte (mock) bir e-posta kanalı servisi içeriyor. Görevin bu iskeleti aşağıdaki gereksinimlere göre çalışan, üretim kalitesinde bir uygulamaya dönüştürmek.

Starter repo'daki mevcut kod **"çalışıyor" kabul edilerek devredilmiştir** — ancak her devraldığın kod tabanında olduğu gibi, kalitesi ve doğruluğu senin sorumluluğundadır.

## 2. Çalışma Kuralları

1. **AI kullanımı serbest ve teşvik edilir.** ChatGPT, Claude, Copilot, Cursor — istediğin aracı istediğin kadar kullanabilirsin. Bu bir kısıtlama testi değil.
2. Repo kökündeki **AGENTS.md** kuralları bu projede bağlayıcıdır (kendi yazdığın kod ve kullandığın AI ajanları için).
3. **Commit disiplini:** Küçük, mantıksal, anlamlı mesajlı commit'ler zorunlu. Gün sonunda tek dev commit kabul edilmez. Mesaj dili Türkçe veya İngilizce olabilir, tutarlı olsun.
4. **DECISIONS.md:** Repo kökünde tutacağın karar günlüğü. Önemli her teknik kararda 3-5 satır: *ne karar verdin, AI ne önerdi (kullandıysan), neyi kabul/ret ettin, neden.*
5. **AI transkriptleri:** Teslim paketine, görev boyunca kullandığın AI konuşmalarının export'unu veya paylaşım linklerini ekleyeceksin. Bunlar değerlendirmenin parçası — "az AI kullanmak" puan getirmez, **AI'ı iyi kullanmak** getirir.
6. Spec'te belirsiz veya çelişkili bulduğun her nokta için soru sorabilirsin. Sorular `QUESTIONS.md` dosyasına yazılır ve iletilir; cevap gelene kadar makul bir varsayımla ilerleyip varsayımını DECISIONS.md'ye not edebilirsin.

## 3. Alan Modeli (özet)

- **Tenant**: platformu kullanan şirket. Her tenant'ın kendi kullanıcıları, ticket'ları ve ayarları vardır. **Bir tenant'ın verisi hiçbir koşulda başka bir tenant'a görünemez.**
- **User**: bir tenant'a bağlıdır. Rolleri: `admin`, `agent` (destek personeli), `customer` (talep açan son kullanıcı).
- **Ticket**: talep kaydı. Alanlar: tenant içi ardışık numara (örn. `ACME-1042`), başlık, açıklama, durum, öncelik, kategori, açan müşteri, atanan agent, zaman damgaları.
  - Durumlar: `new` → `open` → `pending` → `resolved` → `closed`
  - Öncelikler: `low`, `normal`, `high`, `urgent`
- **Comment**: ticket altındaki mesajlar. İki tür: `public_reply` (müşteri görür) ve `internal_note` (yalnızca agent/admin görür).
- **SLA Policy**: önceliğe göre ilk yanıt ve çözüm süresi hedefleri (tenant başına tanımlı, seed'de hazır).
- **InboundMessage**: mock e-posta kanalından gelen ham mesaj kaydı.

Seed verisi hazır: 4 tenant, tenant başına 5-15 kullanıcı, toplam ~100.000 ticket ve ~400.000 yorum.

## 4. Fonksiyonel Gereksinimler

### FR-01 — Kimlik ve Tenant Bağlamı
- Basit e-posta + şifre girişi (seed kullanıcılarıyla). Kayıt akışı gerekmiyor.
- Oturumdaki kullanıcının tenant'ı ve rolü tüm isteklerde bağlayıcıdır.
- **Tenant izolasyonu mutlaktır:** listeler, detaylar, sayaçlar, aramalar — hiçbir endpoint başka tenant'ın verisini döndüremez. ID tahmin edilerek yapılan doğrudan erişim denemeleri de dahil (bkz. NFR-03).

### FR-02 — Ticket Yaşam Döngüsü
- Müşteri ticket açar (`new`); agent yanıtladığında `open`; müşteriden bilgi bekleniyorsa `pending`; çözüm sonrası `resolved`; müşteri onayı veya 5 gün hareketsizlik sonrası `closed`.
- Geçersiz durum geçişleri reddedilir (örn. `closed` → `pending`).
- Her ticket, açıldığı anda **tenant içinde ardışık ve benzersiz** bir numara alır: `ACME-1`, `ACME-2`, … Numaralarda atlama kabul edilir, **çakışma (duplicate) kabul edilmez** — eşzamanlı açılışlarda dahi (bkz. NFR-02).

### FR-03 — Atama
- Agent, atanmamış bir ticket'ı "üstlen" butonuyla kendine alabilir; admin herhangi bir agent'a atayabilir.
- Bir ticket aynı anda yalnızca bir agent'a atanmış olabilir; iki agent'ın aynı anda üstlenmesi durumunda yalnızca biri başarılı olur.

### FR-04 — Yorumlar ve Görünürlük
- Agent'lar `public_reply` veya `internal_note` yazabilir; müşteriler yalnızca `public_reply` yazabilir ve **yalnızca** `public_reply` görebilir.
- İlk `public_reply`, SLA'nın "ilk yanıt" saatini durdurur (FR-06).

### FR-05 — E-posta Kanalı (Mock)
- Starter repo'daki `mock-mail-channel` servisi, tenant'lara gelen destek e-postalarını webhook olarak uygulamana iletir (API sözleşmesi kendi README'sinde). Gerçek e-posta altyapıları gibi davranır: her zaman ideal payload göndermeyebilir.
- Kurallar: bilinen bir ticket'a ait mesaj (konu satırında numara varsa) yorum olarak eklenir; değilse yeni ticket açılır.
- Gelen her veri **doğrulanmalı**; bozuk/tutarsız payload sistemi düşürmemeli ve kayıt altına alınmalıdır.
- Aynı mesajın birden fazla kez işlenmesi (duplicate teslim) mümkün olmamalıdır.

### FR-06 — SLA Takibi
- Her ticket için önceliğe göre **ilk yanıt** ve **çözüm** son tarihleri hesaplanır.
- SLA süreleri **mesai saatleri** üzerinden işler: hafta içi 09:00-18:00 (`Europe/Istanbul`), hafta sonu ve resmi tatiller (seed'de tatil tablosu var) sayılmaz. Örn. Cuma 17:00'de açılan `high` ticket'ın 4 saatlik ilk yanıt hedefi Pazartesi 12:00'dir.
- Süresi geçen ticket'lar `sla_breached` olarak işaretlenir ve dashboard'da listelenir.
- Starter repo'da önceki geliştiriciden kalan bir mesai-saati hesaplayıcısı mevcut; kullanmak veya değiştirmek senin kararın.

Öncelik bazlı SLA hedefleri (tüm tenant'ların seed varsayılanı):

| Öncelik | İlk yanıt | Çözüm |
|---|---|---|
| urgent | 1 saat | 8 saat |
| high | 2 saat | 24 saat |
| normal | 8 saat | 3 iş günü |
| low | 24 saat | 5 iş günü |

### FR-07 — Listeler ve Dashboard
- Agent görünümü: tenant'ının ticket listesi — durum/öncelik/atanan/kategori filtreleri, arama, sayfalama, son yorum önizlemesi.
- Dashboard: açık ticket sayıları (durum ve öncelik kırılımında), SLA ihlalleri, agent başına açık iş yükü.
- Tüm listeler 100k'lık seed verisiyle **akıcı** çalışmalıdır (bkz. NFR-01).

### FR-08 — İşletim Kuralları Ekranı
Admin, aşağıdaki platform kurallarını görüntüleyebilir (düzenleme gerekmiyor, sabit config yeterli):

| Kural | Değer |
|---|---|
| Otomatik kapanma (resolved → closed) | 5 gün hareketsizlik |
| `high` önceliğin ilk yanıt hedefi | 4 saat |
| Mesai saatleri | Hafta içi 09:00-18:00 |
| Webhook yeniden deneme penceresi | 24 saat |

### FR-09 — Türkçe Arayüz
- Arayüz dili Türkçe'dir. Tüm metinlerde Türkçe karakterler doğru kullanılmalı (AGENTS.md §9).
- Seed verisindeki kullanıcı adları ve ticket içerikleri dahil, sistemin hiçbir yerinde bozuk karakter görünmemelidir.

## 5. Fonksiyonel Olmayan Gereksinimler

### NFR-01 — Performans
- Ticket liste endpoint'i (filtreli + sayfalı), seed verisi yüklüyken **p95 < 300 ms** cevap vermelidir.
- Dashboard endpoint'i seed verisiyle **p95 < 500 ms** olmalıdır.
- Repo'daki `npm run perf` scripti bu ölçümü yapar; teslimde sonuç çıktısı README'ye eklenir.

### NFR-02 — Eşzamanlılık
- `npm run race-test`: aynı tenant için 20 paralel ticket oluşturma isteği gönderir → 20 ticket, 20 **benzersiz ardışık** numara. Ayrıca aynı ticket'ı 10 paralel "üstlen" isteğiyle almaya çalışır → yalnızca 1 başarılı. Bu test teslim kriteridir.

### NFR-03 — Tenant İzolasyonu ve Yetki
- `npm run isolation-test`: farklı tenant'ların kullanıcılarıyla çapraz erişim dener (liste, detay, ID tahmini, arama) ve müşteri rolüyle `internal_note` okumaya çalışır. **Sıfır sızıntı** teslim kriteridir.

### NFR-04 — Kod Kalitesi
- TypeScript `strict: true`. `any` kullanımı gerekçelendirilmedikçe kabul edilmez.
- Çekirdek iş mantığı (durum makinesi, numara üretimi, SLA hesabı, webhook işleme, görünürlük kuralları) için birim testleri yazılır. UI testi zorunlu değil.
- Lint temiz geçer (`npm run lint`).

### NFR-05 — Zaman Yönetimi
- Tüm zamanlar veritabanında **UTC** saklanır; arayüzde `Europe/Istanbul` gösterilir.
- SLA hesabı yaz saati geçişleri ve tatil sınırlarında doğru çalışmalıdır.

## 6. Kilometre Taşları

| Gün | Milestone | Beklenen |
|---|---|---|
| 1-2 | **M1 — Analiz & Plan** | Repo incelemesi, QUESTIONS.md, kısa teknik plan (DECISIONS.md'ye), veri modeli onayı |
| 3-5 | **M2 — Çekirdek** | Kimlik/tenant bağlamı, ticket CRUD + durum makinesi + numara üretimi (`race-test` yeşil), izolasyon temeli |
| 6-9 | **M3 — Kanal & SLA & Performans** | E-posta webhook akışı uçtan uca, SLA hesabı ve ihlal listesi, `perf` + `isolation-test` yeşil |
| 10-12 | **M4 — Teslim** | Dashboard, yorum görünürlüğü, testler, temizlik, teslim paketi |

Her milestone sonunda kısa bir mesajla durum bildirilir (2-3 cümle yeterli).

## 7. Teslim Paketi

1. Git repo (tüm commit geçmişiyle — squash yok)
2. `README.md`: kurulum, çalıştırma, perf/race/isolation test sonuçları
3. `DECISIONS.md` ve `QUESTIONS.md`
4. AI transkriptleri (`/ai-transcripts` klasörü: export dosyaları veya link listesi)
5. Kısa demo videosu (5 dk, ekran kaydı yeterli) — opsiyonel ama önerilir

## 8. Değerlendirme (şeffaflık)

İki eksende değerlendirileceksin: **mühendislik kalitesi** (gereksinim analizi, doğruluk, güvenlik/izolasyon, kod kalitesi, test, performans) ve **AI kullanım kalitesi** (prompt'ların, AI çıktısını doğrulama biçimin, kabul/ret kararların, kodunu savunabilmen). Teslimden sonra ~30 dakikalık bir teknik sohbet yapılacak; kodundan seçilen bölümleri açıklaman istenecek.

Başarılar. Soruların için QUESTIONS.md'yi kullan — soru sormak puan kırdırmaz.
