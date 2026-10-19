import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BriefsService } from './briefs.service.js';

// No real disk: file helpers are fakes, so tests can assert on what would be written and deleted.
vi.mock('./brief-files.js', () => ({
  absolutePath: (p: string) => `/uploads/${p}`,
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
  consultant: { email: 'jason@consultly.test' },
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
  return { service: new BriefsService(prisma as never), prisma };
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

  it('rejects files that are not PDFs, and PDFs the AI service cannot read, without saving anything', async () => {
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
    expect(files.saveBriefFile).not.toHaveBeenCalled();
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
