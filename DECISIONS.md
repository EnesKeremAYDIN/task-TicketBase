# DECISIONS — Teknik Karar Günlüğü

> Her önemli teknik kararda: ne karar verdin, AI ne önerdi (kullandıysan), neyi kabul/ret ettin, neden.

---

## 2026-07-16 — Starter Repo Eksikliği

Spec'te (TicketBase.md) starter repo'dan bahsediliyor: proje iskeleti, önceki geliştiriciden kalan modüller, 100k+ seed verisi ve mock e-posta kanalı servisi içerdiği belirtiliyor. Ancak teslim edilmediği için tüm kod sıfırdan oluşturulacak.

**Karar:** Mock mail channel, seed verisi, mesai hesaplayıcı ve tüm uygulama kodunu sıfırdan yazacağım. AI'n önerisi olmadı (danışılmadı). Seed verisi için Prisma seed script'i yazılacak, mock mail channel basit bir Fastify servisi olarak simüle edilecek.

## 2026-07-16 — .env ve DB Dosyalarının Commit'i

Normalde .env ve veritabanı dosyaları (.db) git'e eklenmez ancak bu bir işe alım task projesi olduğu için gizlilik riski yok. Seed verisi ve konfigürasyonun repositoride eksiksiz bulunması, değerlendiren kişinin projeyi sıfırdan kurmadan çalıştırabilmesini sağlar. Bu nedenle .env, *.db ve *.db-journal .gitignore'dan çıkarıldı.
