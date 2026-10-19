import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const weekdays = (startTime: string, endTime: string) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime, endTime }));

const consultants = [
  {
    name: 'Maya Chen',
    email: 'maya@consultly.test',
    headline: 'Go-to-market strategy for B2B SaaS',
    category: 'Strategy',
    bio: 'Former VP Marketing at two Series B startups. I help founders find their first repeatable sales motion.',
    rateCents: 15000,
    timezone: 'America/New_York',
    availability: weekdays('09:00', '17:00'),
  },
  {
    name: 'Jason Jefferson',
    // Set DEMO_CONSULTANT_EMAIL to your own address to sign in as Jason.
    email: process.env.DEMO_CONSULTANT_EMAIL ?? 'jason@consultly.test',
    headline: 'Staff software engineer',
    category: 'Tech',
    bio: 'Staff engineer with 12 years building payment and scheduling platforms. Bring your architecture, code review or system-design question; leave with a concrete plan.',
    rateCents: 20000,
    timezone: 'Europe/London',
    availability: weekdays('10:00', '16:00'),
  },
  {
    name: 'Sora Kim',
    email: 'sora@consultly.test',
    headline: 'Contract & freelance pricing advice',
    category: 'Legal & pricing',
    bio: 'Ten years running a design studio. I review proposals and contracts so you stop under-charging.',
    rateCents: 9000,
    timezone: 'Asia/Seoul',
    availability: [
      ...weekdays('19:00', '22:00'),
      { weekday: 6, startTime: '10:00', endTime: '14:00' },
    ],
  },
  {
    name: 'Priya Nair',
    email: 'priya@consultly.test',
    headline: 'Fundraising strategy & pitch decks',
    category: 'Finance',
    bio: 'Ex-venture associate. I pressure-test your deck and financial model before you walk into a partner meeting.',
    rateCents: 18000,
    timezone: 'Asia/Kolkata',
    availability: [1, 3, 5].map((weekday) => ({
      weekday,
      startTime: '17:00',
      endTime: '21:00',
    })),
  },
  {
    name: 'Lucas Ferreira',
    email: 'lucas@consultly.test',
    headline: 'Product design & UX audits',
    category: 'Design',
    bio: 'Design lead for fintech and marketplace apps. I record a live audit of your product and leave you a ranked fix list.',
    rateCents: 12000,
    timezone: 'America/Sao_Paulo',
    availability: weekdays('08:00', '13:00'),
  },
  {
    name: 'Amara Okoye',
    email: 'amara@consultly.test',
    headline: 'Marketplace growth & pricing strategy',
    category: 'Strategy',
    bio: 'Grew two two-sided marketplaces from launch to profitability. I help you pick which side to subsidise and when to stop.',
    rateCents: 16000,
    timezone: 'Africa/Lagos',
    availability: weekdays('11:00', '17:00'),
  },
  {
    name: 'Tomás Rivera',
    email: 'tomas@consultly.test',
    headline: 'Cloud infrastructure & cost reviews',
    category: 'Tech',
    bio: 'Platform engineer who has cut six-figure cloud bills in half. Share your architecture and your invoice; I bring the savings list.',
    rateCents: 17500,
    timezone: 'America/Mexico_City',
    availability: [1, 2, 3, 4].map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '15:00',
    })),
  },
  {
    name: 'Hannah Becker',
    email: 'hannah@consultly.test',
    headline: 'Brand identity for early-stage startups',
    category: 'Design',
    bio: 'Independent brand designer for 40+ startups. We go from a blank page to a name, logo direction and voice in one session.',
    rateCents: 11000,
    timezone: 'Europe/Berlin',
    availability: weekdays('09:00', '14:00'),
  },
  {
    name: 'Kenji Watanabe',
    email: 'kenji@consultly.test',
    headline: 'Startup finance, runway & unit economics',
    category: 'Finance',
    bio: 'Fractional CFO for seed to Series A companies. I build the runway model with you and show which levers actually move it.',
    rateCents: 19000,
    timezone: 'Asia/Tokyo',
    availability: [
      ...weekdays('18:00', '21:00'),
      { weekday: 6, startTime: '09:00', endTime: '12:00' },
    ],
  },
  {
    name: 'Olivia Grant',
    email: 'olivia@consultly.test',
    headline: 'Freelance contracts & IP ownership',
    category: 'Legal & pricing',
    bio: 'Former in-house counsel at a design agency. I explain your contract in plain English and flag the clauses to push back on.',
    rateCents: 13000,
    timezone: 'Australia/Sydney',
    availability: [2, 3, 4].map((weekday) => ({
      weekday,
      startTime: '08:00',
      endTime: '12:00',
    })),
  },
];

// Idempotent: updates consultants in place (matched by name) so existing bookings survive a re-seed.
async function main() {
  for (const { availability, email, ...data } of consultants) {
    const existing = await prisma.consultant.findFirst({
      where: { name: data.name },
    });
    if (existing) {
      // Keep an email already set in the database (e.g. your own address for Jason).
      await prisma.consultant.update({
        where: { id: existing.id },
        data: { ...data, email: existing.email ?? email },
      });
      await prisma.availability.deleteMany({
        where: { consultantId: existing.id },
      });
      await prisma.availability.createMany({
        data: availability.map((a) => ({ ...a, consultantId: existing.id })),
      });
    } else {
      await prisma.consultant.create({
        data: { ...data, email, availability: { create: availability } },
      });
    }
  }
  console.log(`Seeded ${consultants.length} consultants`);
}

// Top-level await: a failed seed exits with an error instead of an unhandled rejection.
try {
  await main();
} finally {
  await prisma.$disconnect();
}
