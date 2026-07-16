# DECISIONS — Teknik Karar Günlüğü

> Her önemli teknik kararda: ne karar verdin, AI ne önerdi (kullandıysan), neyi kabul/ret ettin, neden.

---

## 2026-07-16 — Starter Repo Eksikliği

Spec'te (TicketBase.md) starter repo'dan bahsediliyor: proje iskeleti, önceki geliştiriciden kalan modüller, 100k+ seed verisi ve mock e-posta kanalı servisi içerdiği belirtiliyor. Ancak teslim edilmediği için tüm kod sıfırdan oluşturulacak.

**Karar:** Mock mail channel, seed verisi, mesai hesaplayıcı ve tüm uygulama kodunu sıfırdan yazacağım. AI'n önerisi olmadı (danışılmadı). Seed verisi için Prisma seed script'i yazılacak, mock mail channel basit bir Fastify servisi olarak simüle edilecek.

## 2026-07-16 — Veritabanı Dosyasının Git'ten Çıkarılması

Normalde DB dosyasını git'e dahil etmiştik ancak GitHub'ın 100 MB limitine takılınca seed verisini küçültmüştüm. Bu, spec'te belirtilen "100k+ ticket" gereksinimini karşılamadığı için doğru değildi. Bunun yerine *.db .gitignore'a eklendi, kullanıcı `npm run db:reset` ile seed'i kendisi oluşturacak. (AI önerisi: DB'yi LFS ile göndermeyi önerdi, ancak LFS kurulumu gerektirdiği ve task projesi olduğu için kabul edilmedi.)
