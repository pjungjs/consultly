import type { PrismaService } from '../prisma/prisma.service.js';
import { hashToken } from './tokens.js';

/** The sign-in cookie's name. */
export const COOKIE = 'consultly_session';

/**
 * The email behind a session cookie, or null when signed out or expired. A plain function (not a service) so
 * modules that AuthModule itself depends on, like orders, can use it without a circular import.
 */
export async function sessionEmail(
  prisma: PrismaService,
  sessionId: string | undefined,
): Promise<string | null> {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(sessionId) },
  });
  return session && session.expiresAt > new Date() ? session.email : null;
}
