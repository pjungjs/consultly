import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Database');

  constructor(private readonly prisma: PrismaService) {}

  /** For the host's health checks: is the API running? Doesn't touch the database, so it stays fast. */
  @Get()
  health() {
    return { ok: true };
  }

  /**
   * Is the database answering? Checked every few days by a scheduled GitHub Action, which both keeps the free
   * Supabase project from pausing (it pauses after 7 quiet days) and emails the owner when this fails.
   */
  @Get('db')
  async database() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: true };
    } catch (err) {
      this.logger.error(`DATABASE CHECK FAILED: ${(err as Error).message}`);
      throw new ServiceUnavailableException({ ok: false, db: false });
    }
  }
}
