# DECISIONS — Teknik Karar Günlüğü

> Her önemli teknik kararda: ne karar verdin, AI ne önerdi (kullandıysan), neyi kabul/ret ettin, neden.

---

## 2026-07-16 — Starter Repo Eksikliği

Spec'te (TicketBase.md) starter repo'dan bahsediliyor: proje iskeleti, önceki geliştiriciden kalan modüller, 100k+ seed verisi ve mock e-posta kanalı servisi içerdiği belirtiliyor. Ancak teslim edilmediği için tüm kod sıfırdan oluşturulacak.

**Karar:** Mock mail channel, seed verisi, mesai hesaplayıcı ve tüm uygulama kodunu sıfırdan yazacağım. AI'n önerisi olmadı (danışılmadı). Seed verisi için Prisma seed script'i yazılacak, mock mail channel basit bir Fastify servisi olarak simüle edilecek.

## 2026-07-16 — Veritabanı Dosyasının Git'ten Çıkarılması

Normalde DB dosyasını git'e dahil etmiştik ancak GitHub'ın 100 MB limitine takılınca seed verisini küçültmüştüm. Bu, spec'te belirtilen "100k+ ticket" gereksinimini karşılamadığı için doğru değildi. Bunun yerine *.db .gitignore'a eklendi, kullanıcı `npm run db:reset` ile seed'i kendisi oluşturacak. (AI önerisi: DB'yi LFS ile göndermeyi önerdi, ancak LFS kurulumu gerektirdiği ve task projesi olduğu için kabul edilmedi.)

## 2026-07-16 — Auth Sistemi Mimarisi

JWT auth için @fastify/jwt kullanıldı. Başlangıçta ayrı bir `authPlugin` içinde register edilmişti ancak Fastify'ın plugin encapsulation yapısı nedeniyle `reply.jwtSign` child context'te kalıp route'lara erişemiyordu. Çözüm: fjwt'yi doğrudan root seviyesinde register etmek, middleware ve route'ları da aynı seviyede tutmak. (AI önerisi: plugin içinde register edip child route yapmayı önerdi, ancak daha temiz olması için root seviyesinde tutmak tercih edildi.)

## 2026-07-16 — JWT Token Süresi

Spec'te JWT süresi belirtilmemişti. 7 gün olarak belirlendi — işe alım task'ı olduğu için sık token yenileme akışına gerek yok. (AI önerisi: 24 saat önerdi, kabul edilmedi — task sürecinde kullanım kolaylığı daha önemli.)

## 2026-07-16 — Login Hata Mesajları ve Timing Attack Koruması

Login hata mesajları daha doğal Türkçe olacak şekilde güncellendi: "Şifre gereklidir" → "Şifre zorunludur", "Geçerli bir e-posta girin" → "Geçerli bir e-posta adresi giriniz". Ayrıca account enumeration saldırılarına karşı timing attack koruması eklendi: kullanıcı var/yok fark etmeksizin bcrypt her durumda çalışacak şekilde dummy hash kullanıldı. (AI önerisi: bu düzeltmeyi AI önerdi — timing attack riskini ilk o fark etti, kabul edildi.)

## 2026-07-16 — Ticket Counter ve Sequental Number Üretimi

Ticket numaralarının race condition olmadan üretilmesi için ayrı bir TicketCounter modeli oluşturuldu. Prisma transaction içinde atomic increment yapılıyor. SQLite'ın serialized isolation seviyesi sayesinde 20 paralel istekte bile 20 benzersiz numara üretildi (race-test ile doğrulandı). (AI önerisi: max+1 yaklaşımını önerdi, ancak 100k kayıtta performans sorunu yaratacağı için counter tablosu tercih edildi.)

## 2026-07-16 — State Machine Tasarımı

Ticket durum geçişleri için ayrı bir state-machine modülü oluşturuldu. Geçerli geçişler: new→open→pending→resolved→closed. Her geçiş route'da validate ediliyor. Müşteri hem listede hem detay sayfasında yalnızca kendi ticket'larına erişebiliyor; agent/admin ise tenant içindeki tüm ticket'lara erişebiliyor.

## 2026-07-22 — `high` İlk Yanıt SLA Hedefi

FR-06 SLA tablosunda `high` önceliğin ilk yanıt hedefi 2 saat olarak belirtilirken, FR-06 örneğinde ve FR-08 işletim kurallarında 4 saat olarak belirtilmiştir.

**Karar:** `high` öncelikli ticket'ların ilk yanıt hedefi 4 saat olarak kabul edildi. FR-06 örneği ve kullanıcıya gösterilen işletim kuralı aynı değeri desteklediği için 4 saat esas alındı. AI, çelişkinin tek bir değer etrafında giderilmesini önerdi; uygulama davranışı ile kullanıcıya gösterilen kuralı uyumlu tutan 4 saatlik hedef kabul edildi.

## 2026-07-22 — Deterministik ve Hızlı Seed Üretimi

Seed süresini uzatan ticket başına SLA sorguları kaldırıldı; aynı SLA formülü kullanılarak deadline değerleri `createMany` öncesinde bellekte hesaplanıyor. Kullanıcı hesapları dokümantasyonla uyumlu sabit fixture'lara taşındı, ticket ve yorum çeşitliliği ise `20260722` anahtarlı deterministik üreticiyle korunuyor.

**Karar:** AI, yeni bir seed kütüphanesi eklemek yerine mevcut SLA ve Prisma yapısının yeniden kullanılmasını önerdi; gereksiz bağımlılık yaratmadığı için kabul edildi. Demo ve filtre testleri için her tenant'a Donanım, Yazılım, Ağ, Erişim, E-posta, Güvenlik ve Diğer kategorileri garantili olarak dağıtılıyor.
