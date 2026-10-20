import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Where brief PDFs live. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set (production), a private Supabase
 * Storage bucket; otherwise the local `uploads/` folder (development). Free hosts wipe their disk on every
 * restart, so deployed files must not live on local disk.
 */
const supabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? {
        url: new URL(url).origin, // just the project address, even if a path like /rest/v1 was pasted
        key,
        bucket: process.env.SUPABASE_BUCKET ?? 'briefs',
      }
    : null;
};

const uploadDir = () => resolve(process.env.UPLOAD_DIR ?? 'uploads');

/**
 * Supabase's key headers. SUPABASE_SERVICE_ROLE_KEY takes either kind of key: the legacy service_role key (a JWT,
 * sent as both apikey and a Bearer token) or the newer secret key (sb_secret_..., which isn't a JWT and goes in
 * apikey only). Supabase is retiring the legacy keys, so switching only means changing the setting.
 */
export const supabaseHeaders = (key: string): Record<string, string> =>
  key.startsWith('sb_secret_')
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };

/** Stores a file under `storedPath`, replacing anything already there. */
export async function putBriefFile(storedPath: string, data: Buffer) {
  const s = supabase();
  if (!s) {
    const path = join(uploadDir(), storedPath);
    await mkdir(dirname(path), { recursive: true });
    return writeFile(path, data);
  }
  const res = await fetch(
    `${s.url}/storage/v1/object/${s.bucket}/${storedPath}`,
    {
      method: 'POST',
      headers: {
        ...supabaseHeaders(s.key),
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    },
  );
  if (!res.ok)
    throw new Error(
      `Storage upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
}

export async function readBriefFile(storedPath: string): Promise<Buffer> {
  const s = supabase();
  if (!s) return readFile(join(uploadDir(), storedPath));
  const res = await fetch(
    `${s.url}/storage/v1/object/${s.bucket}/${storedPath}`,
    {
      headers: supabaseHeaders(s.key),
    },
  );
  if (!res.ok)
    throw new Error(
      `Storage download failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  return Buffer.from(await res.arrayBuffer());
}

export async function removeBriefFile(storedPath: string) {
  const s = supabase();
  if (!s) return rm(join(uploadDir(), storedPath), { force: true });
  await fetch(`${s.url}/storage/v1/object/${s.bucket}`, {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(s.key),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [storedPath] }),
  });
}

/** Saves under a random name, so the client's filename never touches storage. */
export async function saveBriefFile(orderId: string, data: Buffer) {
  const storedPath = `${orderId}-${randomBytes(8).toString('hex')}.pdf`;
  await putBriefFile(storedPath, data);
  return storedPath;
}

/** Deletes an order's brief and its file, e.g. once every session in the order is cancelled. */
export async function removeBrief(prisma: PrismaService, orderId: string) {
  const brief = await prisma.brief.findUnique({ where: { orderId } });
  if (!brief) return;
  await prisma.brief.delete({ where: { orderId } });
  await removeBriefFile(brief.storedPath);
}
