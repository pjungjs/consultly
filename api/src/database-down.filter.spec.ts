import { NotFoundException } from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { DatabaseDownFilter, isDatabaseDown } from './database-down.filter.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
    code,
    clientVersion: 'test',
  });

describe('isDatabaseDown', () => {
  it('recognises an unreachable database, and nothing else', () => {
    expect(isDatabaseDown(prismaError('P1001'))).toBe(true);
    expect(isDatabaseDown(prismaError('P2025'))).toBe(false); // a missing record is a normal error
    expect(isDatabaseDown(new NotFoundException())).toBe(false);
  });
});

describe('DatabaseDownFilter', () => {
  it('answers 503 with a plain message when the database is down', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    };
    new DatabaseDownFilter().catch(prismaError('P1001'), host as never);
    expect(status).toHaveBeenCalledWith(503);
    expect(json.mock.calls[0][0].message).toMatch(/temporarily unavailable/);
  });
});
