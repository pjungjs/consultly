import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BriefsService } from './briefs.service.js';

// No real disk: file helpers are fakes, so tests can assert on what would be written and deleted.
vi.mock('./brief-files.js', () => ({
  readBriefFile: vi.fn().mockResolvedValue(Buffer.from('%PDF')),
  saveBriefFile: vi.fn().mockResolvedValue('o1-new.pdf'),
  removeBriefFile: vi.fn(),
  removeBrief: vi.fn(),
}));
const files = await import('./brief-files.js');

const HOUR = 3_600_000;
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  status: 'CONFIRMED',
  clientEmail: 'Dana@Example.com',
  consultant: { email: 'jason@consultly.test', slotMinutes: 30 },
  bookings: [{ startsAt: new Date(Date.now() + 48 * HOUR) }],
  ...over,
});
const pdf = (over: Record<string, unknown> = {}) => ({
  buffer: Buffer.from('%PDF-1.4 test'),
  originalname: 'plan.pdf',
  size: 13,
  ...over,
});

function setup(found = order()) {
  const prisma = {
    order: { findUnique: vi.fn().mockResolvedValue(found) },
    brief: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }) => create),
    },
  };
  const budget = { take: vi.fn().mockResolvedValue(true) }; // within today's AI cap
  return {
    service: new BriefsService(prisma as never, budget as never),
    prisma,
    budget,
  };
}

/** Fakes the Python AI service's answer (or an outage). */
function aiReplies(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: status < 400, status, json: async () => body }),
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('BriefsService access', () => {
  it('lets the client edit and the consultant read', async () => {
    await expect(
      setup().service.get('o1', 'dana@example.com'),
    ).resolves.toMatchObject({ canEdit: true });
    await expect(
      setup().service.get('o1', 'JASON@consultly.test'),
    ).resolves.toMatchObject({ canEdit: false });
  });

  it("hides other people's bookings and unpaid orders behind 404", async () => {
    await expect(
      setup().service.get('o1', 'mallory@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup(order({ status: 'PENDING' })).service.get('o1', 'dana@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup(null as never).service.get('o1', 'dana@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stops edits once the last session has started', async () => {
    const { service } = setup(
      order({ bookings: [{ startsAt: new Date(Date.now() - HOUR) }] }),
    );
    await expect(service.get('o1', 'dana@example.com')).resolves.toMatchObject({
      canEdit: false,
    });
    await expect(
      service.upload('o1', 'dana@example.com', pdf()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.remove('o1', 'dana@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("doesn't let the consultant upload or remove the client's brief", async () => {
    await expect(
      setup().service.upload('o1', 'jason@consultly.test', pdf()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('BriefsService.upload', () => {
  it('stores the prep sheet from the AI service', async () => {
    aiReplies(200, {
      status: 'READY',
      pages: 2,
      summary: { one_liner: 'x' },
      model: 'claude-sonnet-5-5',
    });
    const { service, prisma } = setup();
    const { brief } = await service.upload('o1', 'dana@example.com', pdf());
    expect(brief).toMatchObject({
      status: 'READY',
      source: 'CLAUDE',
      pages: 2,
      filename: 'plan.pdf',
      storedPath: 'o1-new.pdf',
    });
    expect(prisma.brief.upsert.mock.calls[0][0].where).toEqual({
      orderId: 'o1',
    });
  });

  it('keeps the PDF but no summary in demo mode (no API key)', async () => {
    aiReplies(200, {
      status: 'UNAVAILABLE',
      pages: 1,
      message: 'switched off',
    });
    const { brief } = await setup().service.upload(
      'o1',
      'dana@example.com',
      pdf(),
    );
    expect(brief).toMatchObject({
      status: 'UNAVAILABLE',
      source: 'NONE',
      message: 'switched off',
    });
    expect(files.saveBriefFile).toHaveBeenCalled();
  });

  it('still saves the PDF when the AI service is down, so the consultant can read it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );
    const { brief } = await setup().service.upload(
      'o1',
      'dana@example.com',
      pdf(),
    );
    expect(brief).toMatchObject({ status: 'FAILED', source: 'NONE' });
    expect(files.saveBriefFile).toHaveBeenCalled();
  });

  it('rejects files that are not PDFs before saving, and deletes a saved PDF the AI service cannot read', async () => {
    const { service } = setup();
    await expect(
      service.upload(
        'o1',
        'dana@example.com',
        pdf({ buffer: Buffer.from('hello') }),
      ),
    ).rejects.toThrow('Upload a PDF');
    await expect(
      service.upload('o1', 'dana@example.com', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    aiReplies(422, {
      detail: 'This PDF has 45 pages. Briefs can be at most 30 pages.',
    });
    await expect(
      service.upload('o1', 'dana@example.com', pdf()),
    ).rejects.toThrow('45 pages');
    expect(files.saveBriefFile).toHaveBeenCalledTimes(1); // only the readable-looking PDF got this far
    expect(files.removeBriefFile).toHaveBeenCalledWith('o1-new.pdf');
  });

  it('saves the PDF before asking Claude, so a storage failure costs nothing and says what happened', async () => {
    const { service, prisma } = setup();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(files.saveBriefFile).mockRejectedValueOnce(
      new Error('Storage upload failed (404): Bucket not found'),
    );
    await expect(
      service.upload('o1', 'dana@example.com', pdf()),
    ).rejects.toThrow("couldn't be saved");
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.brief.upsert).not.toHaveBeenCalled();
  });

  it('replaces an existing brief and only then deletes the old file', async () => {
    aiReplies(200, { status: 'READY', pages: 1, summary: {} });
    const { service, prisma } = setup();
    prisma.brief.findUnique.mockResolvedValue({ storedPath: 'o1-old.pdf' });
    await service.upload('o1', 'dana@example.com', pdf());
    expect(files.removeBriefFile).toHaveBeenCalledWith('o1-old.pdf');
    expect(prisma.brief.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(files.removeBriefFile).mock.invocationCallOrder[0],
    );
  });
});

describe('BriefsService when the AI service is down', () => {
  it('keeps the PDF with a try-again message when the host answers with an error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );
    const { service, prisma } = setup();
    await service.upload('o1', 'dana@example.com', pdf());
    expect(prisma.brief.upsert.mock.calls[0][0].create).toMatchObject({
      status: 'FAILED',
      storedPath: 'o1-new.pdf',
    });
  });
});

describe('BriefsService AI guardrails', () => {
  const sent = () => vi.mocked(fetch).mock.calls[0][1]!.body as FormData;

  it("tells the AI service the session's length, so the agenda fits it", async () => {
    aiReplies(200, { status: 'READY', pages: 1, summary: {} });
    await setup().service.upload('o1', 'dana@example.com', pdf());
    expect(sent().get('session_minutes')).toBe('30');
    expect(sent().get('allow_ai')).toBe('true');
  });

  it("past today's cap the PDF is still read and saved, but not summarised", async () => {
    aiReplies(200, {
      status: 'UNAVAILABLE',
      pages: 1,
      message: "Today's limit…",
    });
    const { service, budget } = setup();
    budget.take.mockResolvedValue(false);
    const { brief } = await service.upload('o1', 'dana@example.com', pdf());
    expect(sent().get('allow_ai')).toBe('false');
    expect(brief).toMatchObject({ status: 'UNAVAILABLE', source: 'NONE' });
    expect(files.saveBriefFile).toHaveBeenCalled();
  });

  it('allows 5 uploads per hour per account', async () => {
    aiReplies(200, { status: 'READY', pages: 1, summary: {} });
    const { service } = setup();
    for (let i = 0; i < 5; i++)
      await service.upload('o1', 'dana@example.com', pdf());
    const err = await service
      .upload('o1', 'dana@example.com', pdf())
      .catch((e: HttpException) => e);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  it('serves the original from storage to the people allowed to see it', async () => {
    const { service, prisma } = setup();
    prisma.brief.findUnique.mockResolvedValue({
      storedPath: 'o1-x.pdf',
      filename: 'plan.pdf',
    });
    await expect(
      service.file('o1', 'jason@consultly.test'),
    ).resolves.toMatchObject({ filename: 'plan.pdf' });
    expect(files.readBriefFile).toHaveBeenCalledWith('o1-x.pdf');
  });
});
