import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calculateSLADeadlineValues, type SLADeadlinePolicy } from '../src/backend/services/sla';

const prisma = new PrismaClient();

const TENANTS = [
  {
    slug: 'acme',
    name: 'ACME Corp',
    agentCount: 2,
    customerNames: ['Melis Ay', 'Veli Kurt', 'Kutay Eren', 'Ferit Kaya', 'Umut Ateş'],
  },
  {
    slug: 'globex',
    name: 'Globex Corporation',
    agentCount: 4,
    customerNames: ['Savaş Durmaz', 'Bora İnce', 'Hilal Özkan', 'Ferit Kaya', 'Hüseyin Koç'],
  },
  {
    slug: 'initech',
    name: 'Initech',
    agentCount: 4,
    customerNames: [
      'Meltem Bozkurt', 'Burak Yılmaz', 'Elif Arslan', 'Caner Taş',
      'Büşra Özdemir', 'Aslıhan Aktaş', 'Yiğit Koçak', 'Berkay Toprak',
    ],
  },
  {
    slug: 'umbrella',
    name: 'Umbrella Inc',
    agentCount: 3,
    customerNames: ['Rabia Demirel', 'Bilge Yontar', 'Özge Şeker'],
  },
] as const;

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = ['new', 'open', 'pending', 'resolved', 'closed'] as const;

const SLA_CONFIG: Record<string, SLADeadlinePolicy> = {
  urgent: { firstResponseH: 1, resolutionH: 8, resolutionIsBD: false },
  high: { firstResponseH: 4, resolutionH: 24, resolutionIsBD: false },
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

const CATEGORIES = ['Donanım', 'Yazılım', 'Ağ', 'Erişim', 'E-posta', 'Güvenlik', 'Diğer'] as const;
type TicketCategory = typeof CATEGORIES[number];

const CATEGORY_SUBJECTS: Record<TicketCategory, readonly string[]> = {
  'Donanım': ['Yazıcı', 'Monitör', 'Klavye', 'Fare', 'Web kamerası', 'Disk', 'RAM', 'Projeksiyon'],
  'Yazılım': ['PowerPoint', 'Excel', 'Teams', 'Zoom', 'Slack', 'Muhasebe uygulaması', 'Tarayıcı'],
  'Ağ': ['VPN bağlantısı', 'Kablosuz ağ', 'DNS kaydı', 'DHCP havuzu', 'Proxy ayarları', 'Ağ sürücüsü'],
  'Erişim': ['Kullanıcı hesabı', 'Dosya paylaşım izni', 'Uzaktan erişim', 'Yetki grubu', 'Akıllı kart'],
  'E-posta': ['E-posta hesabı', 'Outlook profili', 'E-posta kotası', 'E-posta imzası', 'Takvim paylaşımı'],
  'Güvenlik': ['Antivirüs yazılımı', 'Güvenlik duvarı', 'SSL sertifikası', 'İki faktörlü doğrulama', 'Güvenlik taraması'],
  'Diğer': ['Yedekleme servisi', 'Sanal makine', 'Raporlama servisi', 'Depolama alanı', 'Sunucu servisi'],
};

const VERBS = [
  'açılamıyor', 'çalışmıyor', 'hata veriyor', 'bağlanamıyor',
  'kilitlendi', 'bozuldu', 'güncellenemiyor', 'sıfırlanması gerekiyor',
  'performans sorunu', 'yapılandırma hatası', 'uyum sorunu',
];

const RANDOM_SEED = 20260722;
const TICKETS_PER_TENANT = 25000;
const COMMENTS_PER_TENANT = 100000;
let randomState = RANDOM_SEED;

function nextRandom(): number {
  randomState = (randomState + 0x6D2B79F5) | 0;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function randomInt(min: number, max: number): number {
  return Math.floor(nextRandom() * (max - min + 1)) + min;
}

function randomItem<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(nextRandom() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + nextRandom() * (end.getTime() - start.getTime()));
}

function generateTitle(category = randomItem(CATEGORIES)): string {
  const subject = randomItem(CATEGORY_SUBJECTS[category]);
  return `${subject} ${randomItem(VERBS)}`;
}

async function validateSeed(): Promise<void> {
  const expectedUserCount = TENANTS.reduce(
    (total, tenant) => total + 1 + tenant.agentCount + tenant.customerNames.length,
    0,
  );
  const expectedTicketCount = TENANTS.length * TICKETS_PER_TENANT;
  const expectedCommentCount = TENANTS.length * COMMENTS_PER_TENANT;

  const [userCount, ticketCount, commentCount, uncategorizedCount, missingSlaCount, categoryGroups] = await Promise.all([
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.comment.count(),
    prisma.ticket.count({ where: { category: null } }),
    prisma.ticket.count({
      where: {
        OR: [
          { firstResponseSlaDue: null },
          { slaDueAt: null },
        ],
      },
    }),
    prisma.ticket.groupBy({ by: ['category'] }),
  ]);

  const actualCategories = new Set(categoryGroups.map((group) => group.category));
  const missingCategories = CATEGORIES.filter((category) => !actualCategories.has(category));

  const errors = [
    userCount === expectedUserCount ? null : `Kullanıcı sayısı ${userCount}; beklenen ${expectedUserCount}`,
    ticketCount === expectedTicketCount ? null : `Ticket sayısı ${ticketCount}; beklenen ${expectedTicketCount}`,
    commentCount === expectedCommentCount ? null : `Yorum sayısı ${commentCount}; beklenen ${expectedCommentCount}`,
    uncategorizedCount === 0 ? null : `${uncategorizedCount} ticket kategorisiz`,
    missingSlaCount === 0 ? null : `${missingSlaCount} ticket'ın SLA tarihi eksik`,
    missingCategories.length === 0 ? null : `Eksik kategoriler: ${missingCategories.join(', ')}`,
  ].filter((error): error is string => error !== null);

  if (errors.length > 0) {
    throw new Error(`Seed doğrulaması başarısız:\n- ${errors.join('\n- ')}`);
  }

  console.log(`  Doğrulandı: ${userCount} kullanıcı, ${ticketCount} ticket, ${commentCount} yorum, ${CATEGORIES.length} kategori.`);
}

async function main() {
  console.log('Seed başlıyor...');
  console.log(`  Deterministik veri anahtarı: ${RANDOM_SEED}`);

  const passwordHash = bcrypt.hashSync('123456', 10);
  const holidayDates = TURKISH_HOLIDAYS_2026.map((holiday) => new Date(holiday.date));

  for (const tenantData of TENANTS) {
    console.log(`  Tenant oluşturuluyor: ${tenantData.name}`);

    const tenant = await prisma.tenant.create({
      data: { slug: tenantData.slug, name: tenantData.name },
    });

    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `admin@${tenantData.slug}.com`,
        password: passwordHash,
        name: `${tenantData.name} Admin`,
        role: 'admin',
      },
    });

    const agents: string[] = [];
    for (let i = 1; i <= tenantData.agentCount; i++) {
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `agent${i}@${tenantData.slug}.com`,
          password: passwordHash,
          name: `${tenantData.name} Ajan ${i}`,
          role: 'agent',
        },
      });
      agents.push(user.id);
    }

    const customers: string[] = [];
    for (let i = 0; i < tenantData.customerNames.length; i++) {
      const name = tenantData.customerNames[i];
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `musteri${i + 1}@${tenantData.slug}.com`,
          password: passwordHash,
          name,
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

    const ticketCount = TICKETS_PER_TENANT;
    console.log(`  ${ticketCount} ticket oluşturuluyor...`);

    const batchSize = 1000;
    let ticketNumber = 1;

    for (let batch = 0; batch < ticketCount; batch += batchSize) {
      const size = Math.min(batchSize, ticketCount - batch);
      const tickets = [];

      for (let i = 0; i < size; i++) {
        const number = ticketNumber++;
        const status = randomItem(STATUSES);
        const priority = randomItem(PRIORITIES);
        const category = CATEGORIES[(number - 1) % CATEGORIES.length];
        const customerId = randomItem(customers);
        const assignedToId = ['open', 'pending', 'resolved', 'closed'].includes(status)
          ? randomItem(agents)
          : null;
        const createdAt = randomDate(new Date('2025-01-01'), new Date('2026-06-01'));
        const title = generateTitle(category);
        const deadlines = calculateSLADeadlineValues(createdAt, SLA_CONFIG[priority], holidayDates);

        tickets.push({
          tenantId: tenant.id,
          number,
          displayId: `${tenantData.slug.toUpperCase()}-${number}`,
          title,
          description: `${title} ile ilgili detaylı açıklama. Sorun giderme adımları denendi ancak çözülemedi.`,
          status,
          priority,
          category,
          customerId,
          assignedToId,
          firstResponseSlaDue: deadlines.firstResponseSlaDue,
          slaDueAt: deadlines.slaDueAt,
          createdAt,
          updatedAt: createdAt,
        });
      }

      await prisma.ticket.createMany({ data: tickets });
    }

    const allTickets = await prisma.ticket.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, customerId: true, assignedToId: true, status: true, createdAt: true },
      orderBy: { number: 'asc' },
    });

    const commentCount = COMMENTS_PER_TENANT;
    console.log(`  ${commentCount} yorum oluşturuluyor...`);

    for (let batch = 0; batch < commentCount; batch += batchSize) {
      const size = Math.min(batchSize, commentCount - batch);
      const comments = [];

      for (let i = 0; i < size; i++) {
        const ticket = randomItem(allTickets);
        const isAgent = nextRandom() > 0.5;
        const isInternal = isAgent && nextRandom() > 0.7;
        const authorId = isAgent
          ? randomItem(agents)
          : ticket.customerId;
        const commentDate = new Date(ticket.createdAt.getTime() + randomInt(3600000, 259200000));

        comments.push({
          ticketId: ticket.id,
          authorId,
          type: isInternal ? 'internal_note' : 'public_reply',
          body: isInternal
            ? `İç not: Bu ticket için takip gerekiyor. ${generateTitle()}`
            : `${generateTitle()} ile ilgili olarak bilgi verildi. Müşteri bilgilendirildi.`,
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

  await validateSeed();
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
