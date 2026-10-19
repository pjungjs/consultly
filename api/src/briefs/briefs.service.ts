import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  absolutePath,
  removeBrief,
  removeBriefFile,
  saveBriefFile,
} from './brief-files.js';

export const MAX_BRIEF_BYTES = 10 * 1024 * 1024;

/** The parts of a multer upload this service uses. */
export type UploadedPdf = {
  buffer: Buffer;
  originalname: string;
  size: number;
};

type AiResult = {
  status: 'READY' | 'NO_TEXT' | 'UNAVAILABLE' | 'FAILED';
  pages: number;
  summary?: Prisma.InputJsonValue | null;
  model?: string | null;
  message?: string | null;
};

const PUBLIC_FIELDS = {
  filename: true,
  sizeBytes: true,
  pages: true,
  status: true,
  source: true,
  summary: true,
  model: true,
  message: true,
  updatedAt: true,
} as const;

@Injectable()
export class BriefsService {
  private readonly logger = new Logger(BriefsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The client who booked, or the consultant they booked; anyone else sees "not found". */
  private async access(orderId: string, email: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        consultant: { select: { email: true } },
        bookings: {
          where: { status: 'CONFIRMED' },
          select: { startsAt: true },
        },
      },
    });
    const isClient =
      !!order && order.clientEmail.toLowerCase() === email.toLowerCase();
    const isConsultant =
      !!order?.consultant.email &&
      order.consultant.email.toLowerCase() === email.toLowerCase();
    if (!order || order.status !== 'CONFIRMED' || (!isClient && !isConsultant))
      throw new NotFoundException('Booking not found');
    // A brief is for preparing, so it can be added or changed until the order's last session starts.
    const canEdit =
      isClient && order.bookings.some((b) => b.startsAt > new Date());
    return { order, isClient, canEdit };
  }

  async get(orderId: string, email: string) {
    const { canEdit } = await this.access(orderId, email);
    const brief = await this.prisma.brief.findUnique({
      where: { orderId },
      select: PUBLIC_FIELDS,
    });
    return { brief, canEdit };
  }

  async file(orderId: string, email: string) {
    await this.access(orderId, email);
    const brief = await this.prisma.brief.findUnique({ where: { orderId } });
    if (!brief) throw new NotFoundException('No brief for this booking');
    return { path: absolutePath(brief.storedPath), filename: brief.filename };
  }

  async upload(orderId: string, email: string, file: UploadedPdf | undefined) {
    const { canEdit } = await this.access(orderId, email);
    if (!canEdit)
      throw new ConflictException(
        'Briefs can only be added by the client, before the session starts.',
      );
    if (!file) throw new BadRequestException('Choose a PDF to upload.');
    if (!file.buffer.subarray(0, 4).equals(Buffer.from('%PDF')))
      throw new BadRequestException('Upload a PDF file.');

    const result = await this.summarise(file);
    const storedPath = await saveBriefFile(orderId, file.buffer);
    const previous = await this.prisma.brief.findUnique({ where: { orderId } });
    const data = {
      filename: file.originalname.slice(0, 200),
      storedPath,
      sizeBytes: file.size,
      pages: result.pages,
      status: result.status,
      source: result.status === 'READY' ? 'CLAUDE' : 'NONE',
      summary: result.summary ?? Prisma.DbNull,
      model: result.model ?? null,
      message: result.message ?? null,
    };
    const brief = await this.prisma.brief.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
      select: PUBLIC_FIELDS,
    });
    // Replace: the old file goes only after the new one is saved and recorded.
    if (previous) await removeBriefFile(previous.storedPath);
    return { brief, canEdit };
  }

  async remove(orderId: string, email: string) {
    const { canEdit } = await this.access(orderId, email);
    if (!canEdit)
      throw new ConflictException(
        'Briefs can only be removed by the client, before the session starts.',
      );
    await removeBrief(this.prisma, orderId);
    return { brief: null, canEdit };
  }

  /** Sends the PDF to the Python AI service, which reads it and (with an API key) writes the prep sheet. */
  private async summarise(file: UploadedPdf): Promise<AiResult> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: 'application/pdf' }),
      'brief.pdf',
    );
    let res: Response;
    try {
      res = await fetch(
        `${process.env.AI_URL ?? 'http://127.0.0.1:8000'}/briefs/summarize`,
        { method: 'POST', body: form },
      );
    } catch (err) {
      // The PDF is still saved, so the consultant can read the original; re-uploading retries the summary.
      this.logger.error(`AI service unreachable: ${(err as Error).message}`);
      return {
        status: 'FAILED',
        pages: 0,
        message:
          "The AI service isn't reachable right now, so there's no summary yet. Upload the PDF again later.",
      };
    }
    const body = (await res.json()) as AiResult & { detail?: string };
    // 4xx from the AI service means the file itself is the problem (not a PDF, too long, password-protected).
    if (!res.ok)
      throw new BadRequestException(
        body.detail ?? 'This PDF could not be read.',
      );
    return body;
  }
}
