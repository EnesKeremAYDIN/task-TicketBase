import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANTS = [
  { slug: 'acme', name: 'ACME Corp' },
  { slug: 'globex', name: 'Globex Corporation' },
  { slug: 'initech', name: 'Initech' },
  { slug: 'umbrella', name: 'Umbrella Inc' },
];

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = ['new', 'open', 'pending', 'resolved', 'closed'] as const;

const SLA_CONFIG: Record<string, { firstResponseH: number; resolutionH: number; resolutionIsBD: boolean }> = {
  urgent: { firstResponseH: 1, resolutionH: 8, resolutionIsBD: false },
  high: { firstResponseH: 2, resolutionH: 24, resolutionIsBD: false },
  normal: { firstResponseH: 8, resolutionH: 3, resolutionIsBD: true },
  low: { firstResponseH: 24, resolutionH: 5, resolutionIsBD: true },
};

const TURKISH_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: 'Yılbaşı' },
  { date: '2026-04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { date: '2026-05-01', name: 'Emek ve Dayanışma Günü' },
  { date: '2026-05-19', name: 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı' },
  { date: '2026-07-15', name: 'Demokrasi ve Milli Birlik Günü' },
  { date: '2026-08-30', name: 'Zafer Bayramı' },
  { date: '2026-10-29', name: 'Cumhuriyet Bayramı' },
];

const CUSTOMER_NAMES = [
  'Ayşe Yılmaz', 'Mehmet Demir', 'Fatma Şahin', 'Mustafa Çelik',
  'Zeynep Kaya', 'Ali Öztürk', 'Elif Arslan', 'Hüseyin Koç',
  'İrem Yıldız', 'Ahmet Polat', 'Selin Aydın', 'Veli Kurt',
  'Büşra Özdemir', 'Murat Kılıç', 'Gamze Aslan', 'Emre Güneş',
  'Dilara Çetin', 'İsmail Kaya', 'Merve Yalçın', 'Kaan Yıldırım',
  'Aslıhan Aktaş', 'Okan Şahin', 'Ceren Bulut', 'Burak Yılmaz',
];

const TICKET_TITLES = [
  'E-posta hesabı açılamıyor', 'VPN bağlantı sorunu', 'Yazıcı arızası',
  'Şifre sıfırlama talebi', 'Yazılım lisansı yenileme', 'Bilgisayar yavaş çalışıyor',
  'Ağ bağlantısı kesiliyor', 'Uygulama hata veriyor', 'Ek donanım talebi',
  'Kullanıcı hesabı kilitlendi', 'Veri tabanı bağlantı hatası', 'Monitör arızası',
  'Yedekleme hatası', 'Güvenlik duvarı ayarı', 'Sanal sunucu talebi',
  'E-posta kotası aşımı', 'Antivirüs güncellemesi', 'Dosya paylaşım izni',
  'Uzaktan erişim talebi', 'Sistem güncellemesi', 'Klavye arızası',
  'Fare çalışmıyor', 'Kulaklık sorunu', 'Web kamerası algılanmıyor',
  'USB port çalışmıyor', 'Ekran kartı sürücüsü', 'Ses kartı sorunu',
  'Toplantı odası donanımı', 'Projeksiyon bağlantısı', 'Akıllı kart okuyucu',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('Seed başlıyor...');

  for (const tenantData of TENANTS) {
    console.log(`  Tenant oluşturuluyor: ${tenantData.name}`);

    const tenant = await prisma.tenant.create({ data: tenantData });

    const admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `admin@${tenantData.slug}.com`,
        password: bcrypt.hashSync('123456', 10),
        name: `${tenantData.name} Admin`,
        role: 'admin',
      },
    });

    const agentCount = randomInt(2, 4);
    const agents: string[] = [];
    for (let i = 1; i <= agentCount; i++) {
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `agent${i}@${tenantData.slug}.com`,
          password: bcrypt.hashSync('123456', 10),
          name: `${tenantData.name} Ajan ${i}`,
          role: 'agent',
        },
      });
      agents.push(user.id);
    }

    const customerCount = randomInt(3, 8);
    const customers: string[] = [];
    for (let i = 0; i < customerCount; i++) {
      const name = CUSTOMER_NAMES[customers.length % CUSTOMER_NAMES.length];
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `musteri${customers.length + 1}@${tenantData.slug}.com`,
          password: bcrypt.hashSync('123456', 10),
          name: `${name}`,
          role: 'customer',
        },
      });
      customers.push(user.id);
    }

    for (const [priority, config] of Object.entries(SLA_CONFIG)) {
      await prisma.sLAPolicy.create({
        data: {
          tenantId: tenant.id,
          priority,
          firstResponseH: config.firstResponseH,
          resolutionH: config.resolutionH,
          resolutionIsBD: config.resolutionIsBD,
        },
      });
    }

    for (const holiday of TURKISH_HOLIDAYS_2026) {
      await prisma.holiday.create({
        data: {
          tenantId: tenant.id,
          date: new Date(holiday.date),
          name: holiday.name,
        },
      });
    }

    const ticketCount = 25000;
    console.log(`  ${ticketCount} ticket oluşturuluyor...`);

    const batchSize = 1000;
    let ticketNumber = 1;

    for (let batch = 0; batch < ticketCount; batch += batchSize) {
      const size = Math.min(batchSize, ticketCount - batch);
      const tickets = [];

      for (let i = 0; i < size; i++) {
        const status = randomItem(STATUSES);
        const priority = randomItem(PRIORITIES);
        const customerId = randomItem(customers);
        const assignedToId = ['open', 'pending', 'resolved', 'closed'].includes(status)
          ? randomItem(agents)
          : null;
        const createdAt = randomDate(new Date('2025-01-01'), new Date('2026-06-01'));

        tickets.push({
          tenantId: tenant.id,
          number: ticketNumber++,
          displayId: `${tenantData.slug.toUpperCase()}-${ticketNumber - 1}`,
          title: randomItem(TICKET_TITLES),
          description: `${randomItem(TICKET_TITLES)} ile ilgili detaylı açıklama. Sorun giderme adımları denendi ancak çözülemedi.`,
          status,
          priority,
          customerId,
          assignedToId,
          createdAt,
          updatedAt: createdAt,
        });
      }

      await prisma.ticket.createMany({ data: tickets });
    }

    const allTickets = await prisma.ticket.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, customerId: true, assignedToId: true, status: true, createdAt: true },
    });

    const commentCount = 100000;
    console.log(`  ${commentCount} yorum oluşturuluyor...`);

    for (let batch = 0; batch < commentCount; batch += batchSize) {
      const size = Math.min(batchSize, commentCount - batch);
      const comments = [];

      for (let i = 0; i < size; i++) {
        const ticket = randomItem(allTickets);
        const isAgent = Math.random() > 0.5;
        const isInternal = isAgent && Math.random() > 0.7;
        const authorId = isAgent
          ? randomItem(agents)
          : ticket.customerId;
        const commentDate = new Date(ticket.createdAt.getTime() + randomInt(3600000, 259200000));

        comments.push({
          ticketId: ticket.id,
          authorId,
          type: isInternal ? 'internal_note' : 'public_reply',
          body: isInternal
            ? `İç not: Bu ticket için takip gerekiyor. ${randomItem(TICKET_TITLES)}`
            : `${randomItem(TICKET_TITLES)} ile ilgili olarak bilgi verildi. Müşteri bilgilendirildi.`,
          createdAt: commentDate,
          updatedAt: commentDate,
        });
      }

      await prisma.comment.createMany({ data: comments });
    }

    await prisma.ticketCounter.create({
      data: { tenantId: tenant.id, lastNumber: ticketCount },
    });

    console.log(`  ${tenantData.name} tamamlandı.`);
  }

  console.log('Seed tamamlandı!');
}

main()
  .catch((e) => {
    console.error('Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
