import { sessionEmail } from './session.js';
import { hashToken } from './tokens.js';

const prisma = (session: unknown) => ({
  session: { findUnique: vi.fn().mockResolvedValue(session) },
});

describe('sessionEmail', () => {
  it('finds the email by the hash of the cookie, never the raw value', async () => {
    const db = prisma({
      email: 'dana@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(sessionEmail(db as never, 'raw-cookie')).resolves.toBe(
      'dana@example.com',
    );
    expect(db.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw-cookie') },
    });
  });

  it('is null when signed out, unknown or expired', async () => {
    await expect(
      sessionEmail(prisma(null) as never, undefined),
    ).resolves.toBeNull();
    await expect(
      sessionEmail(prisma(null) as never, 'nope'),
    ).resolves.toBeNull();
    await expect(
      sessionEmail(
        prisma({ email: 'x', expiresAt: new Date(Date.now() - 1) }) as never,
        'old',
      ),
    ).resolves.toBeNull();
  });
});
