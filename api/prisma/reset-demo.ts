import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { removeBrief } from '../src/briefs/brief-files.js';

// Removes every "Try the demo" visitor's private accounts and what they booked, from either side.
// Visitors reset their own demo on the website; this clears them all at once. Run: npm run reset:demo

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Demo accounts live on the fake consultly.test domain: demo-<id>@ (client) and jason-<id>@ (consultant copy).
const demoEmail = { endsWith: '@consultly.test' };

async function main() {
  const copies = await prisma.consultant.findMany({
    where: { demoOwner: { not: null } },
    select: { id: true },
  });
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { clientEmail: { ...demoEmail, startsWith: 'demo' } },
        { clientEmail: { ...demoEmail, startsWith: 'jason-' } },
        { consultantId: { in: copies.map((c) => c.id) } },
      ],
    },
    select: { id: true },
  });
  for (const { id } of orders) await removeBrief(prisma as never, id);
  await prisma.order.deleteMany({
    where: { id: { in: orders.map((o) => o.id) } },
  }); // bookings cascade
  await prisma.consultant.deleteMany({ where: { demoOwner: { not: null } } }); // hours and time off cascade
  for (const where of [
    { email: { ...demoEmail, startsWith: 'demo' } },
    { email: { ...demoEmail, startsWith: 'jason-' } },
  ]) {
    await prisma.client.deleteMany({ where });
    await prisma.session.deleteMany({ where });
  }
  console.log(
    `Demo reset: removed ${copies.length} demo visitors and ${orders.length} demo orders.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
