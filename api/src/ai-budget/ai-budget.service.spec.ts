import { AiBudgetService } from './ai-budget.service.js';

function setup(countAfter: number) {
  const prisma = {
    aiUsage: { upsert: vi.fn().mockResolvedValue({ count: countAfter }) },
  };
  return { budget: new AiBudgetService(prisma as never), prisma };
}

afterEach(() => vi.unstubAllEnvs());

describe('AiBudgetService', () => {
  it("counts each call against today's UTC date in one atomic upsert", async () => {
    const { budget, prisma } = setup(1);
    await budget.take('chat', new Date('2026-10-19T23:30:00-04:00')); // already Oct 20 in UTC
    const args = prisma.aiUsage.upsert.mock.calls[0][0];
    expect(args.where.day_kind).toEqual({
      day: new Date('2026-10-20T00:00:00Z'),
      kind: 'chat',
    });
    expect(args.update).toEqual({ count: { increment: 1 } });
  });

  it('allows calls up to the cap and refuses the next one', async () => {
    expect(await setup(200).budget.take('chat')).toBe(true);
    expect(await setup(201).budget.take('chat')).toBe(false);
    expect(await setup(31).budget.take('brief')).toBe(false); // briefs default to 30 a day
  });

  it('reads the caps from the environment', async () => {
    vi.stubEnv('AI_DAILY_BRIEF_LIMIT', '0'); // 0 switches AI briefs off entirely
    expect(await setup(1).budget.take('brief')).toBe(false);
    vi.stubEnv('AI_DAILY_CHAT_LIMIT', 'not-a-number');
    expect(setup(1).budget.limit('chat')).toBe(200);
  });
});
