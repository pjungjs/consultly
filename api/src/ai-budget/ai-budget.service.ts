import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type AiKind = 'chat' | 'brief';

const DEFAULT_DAILY_LIMIT: Record<AiKind, number> = { chat: 200, brief: 30 };

/** Daily cap on Claude API calls, counted in the database so it survives restarts (free hosts sleep and restart often). */
@Injectable()
export class AiBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  limit(kind: AiKind) {
    const fromEnv = Number(
      process.env[
        kind === 'chat' ? 'AI_DAILY_CHAT_LIMIT' : 'AI_DAILY_BRIEF_LIMIT'
      ],
    );
    return Number.isInteger(fromEnv) && fromEnv >= 0
      ? fromEnv
      : DEFAULT_DAILY_LIMIT[kind];
  }

  /** Counts one call for today (UTC) and says whether it's still within the cap. One atomic upsert, so concurrent calls can't both slip past it. */
  async take(kind: AiKind, now = new Date()): Promise<boolean> {
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const { count } = await this.prisma.aiUsage.upsert({
      where: { day_kind: { day, kind } },
      create: { day, kind, count: 1 },
      update: { count: { increment: 1 } },
    });
    return count <= this.limit(kind);
  }
}
