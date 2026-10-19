import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Brief PDFs live on local disk for now; swap this for object storage (e.g. S3) when deploying. */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');

export const absolutePath = (storedPath: string) =>
  join(UPLOAD_DIR, storedPath);

/** Saves under a random name, so the client's filename never touches the filesystem. */
export async function saveBriefFile(orderId: string, data: Buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const storedPath = `${orderId}-${randomBytes(8).toString('hex')}.pdf`;
  await writeFile(absolutePath(storedPath), data);
  return storedPath;
}

export const removeBriefFile = (storedPath: string) =>
  rm(absolutePath(storedPath), { force: true });

/** Deletes an order's brief and its file, e.g. once every session in the order is cancelled. */
export async function removeBrief(prisma: PrismaService, orderId: string) {
  const brief = await prisma.brief.findUnique({ where: { orderId } });
  if (!brief) return;
  await prisma.brief.delete({ where: { orderId } });
  await removeBriefFile(brief.storedPath);
}
