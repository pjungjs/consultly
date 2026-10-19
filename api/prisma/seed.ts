import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { consultants } from './seed-data.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Idempotent: updates consultants in place (matched by name) so existing bookings survive a re-seed.
async function main() {
  for (const { availability, email, ...data } of consultants) {
    const existing = await prisma.consultant.findFirst({
      where: { name: data.name, demoOwner: null }, // never a demo visitor's copy
    });
    if (existing) {
      // Keep an email already set in the database (e.g. your own address for Jason).
      await prisma.consultant.update({
        where: { id: existing.id },
        data: { slotMinutes: 60, ...data, email: existing.email ?? email },
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
