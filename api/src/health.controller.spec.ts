import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('GET /health/db', () => {
  it('reports the database as up when a query works', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]) };
    await expect(
      new HealthController(prisma as never).database(),
    ).resolves.toEqual({ ok: true, db: true });
  });

  it('answers 503 when the database is unreachable, so the scheduled check fails and emails', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('down')) };
    await expect(
      new HealthController(prisma as never).database(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
