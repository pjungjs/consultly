import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { putBriefFile } from '../src/briefs/brief-files.js';

// Demo mode: attaches pre-written briefs and prep sheets (prisma/samples/) to existing bookings,
// so the feature can be seen without an Anthropic API key. Safe to re-run: it replaces its own samples.
// Regenerate the PDFs from the .txt sources with: cd ai && uv run python scripts/make_sample_pdfs.py

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const SAMPLES = join(import.meta.dirname, 'samples');
// The demo account (your own address, from .env) books as a client too.
const demoClient = process.env.DEMO_CLIENT_EMAIL;

const samples = [
  // Seen from the client side: the demo account's booking with Kenji, in My bookings.
  {
    file: 'fernleaf-runway-brief',
    consultant: 'Kenji Watanabe',
    where: demoClient
      ? { clientEmail: { equals: demoClient, mode: 'insensitive' as const } }
      : null,
  },
];

async function main() {
  for (const sample of samples) {
    if (!sample.where) {
      console.log(`skip ${sample.file}: set DEMO_CLIENT_EMAIL in .env`);
      continue;
    }
    // Prefer a booking that still has a session ahead, so the brief can be replaced from the UI too.
    const orders = await prisma.order.findMany({
      where: {
        ...sample.where,
        status: 'CONFIRMED',
        consultant: { name: sample.consultant },
        bookings: { some: { status: 'CONFIRMED' } },
      },
      include: {
        bookings: {
          where: { status: 'CONFIRMED' },
          orderBy: { startsAt: 'desc' },
          take: 1,
        },
      },
    });
    const order = orders.sort(
      (a, b) =>
        b.bookings[0].startsAt.getTime() - a.bookings[0].startsAt.getTime(),
    )[0];
    if (!order) {
      console.log(
        `skip ${sample.file}: no confirmed booking with ${sample.consultant} found`,
      );
      continue;
    }
    const pdf = join(SAMPLES, `${sample.file}.pdf`);
    const storedPath = `${order.id}-sample.pdf`;
    const bytes = await readFile(pdf);
    await putBriefFile(storedPath, bytes);
    const data = {
      filename: `${sample.file}.pdf`,
      storedPath,
      sizeBytes: bytes.length,
      pages: 1,
      status: 'READY',
      source: 'SAMPLE',
      summary: JSON.parse(
        await readFile(join(SAMPLES, `${sample.file}.json`), 'utf8'),
      ),
      model: null,
      message: null,
    };
    await prisma.brief.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, ...data },
      update: data,
    });
    console.log(
      `attached ${sample.file} to ${order.clientName}'s booking with ${sample.consultant} (${order.bookings[0].startsAt.toISOString().slice(0, 16)}Z)`,
    );
  }
}

// Top-level await: a failed seed exits with an error instead of an unhandled rejection.
try {
  await main();
} finally {
  await prisma.$disconnect();
}
