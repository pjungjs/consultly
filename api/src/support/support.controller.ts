import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { AiBudgetService } from '../ai-budget/ai-budget.service.js';
import { aiHeaders, aiUrl } from '../ai-budget/ai-service.js';
import { COOKIE } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';
import { RateLimiter } from './rate-limiter.js';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

export class ChatDto {
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  messages: ChatMessageDto[];

  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  /** The Help panel's Live AI / Demo switch; demo never calls Claude. */
  @IsOptional()
  @IsIn(['ai', 'demo'])
  mode?: 'ai' | 'demo';
}

/** The Help bubble. Forwards to the Python AI service, which answers from the help topics and the user's own bookings. */
@Controller('support')
export class SupportController {
  private readonly logger = new Logger(SupportController.name);
  // Each AI answer costs money: 20 messages per 10 minutes per visitor is plenty for real help.
  private readonly limiter = new RateLimiter(20, 10 * 60_000);

  constructor(
    private readonly budget: AiBudgetService,
    private readonly auth: AuthService,
  ) {}

  private lastWake = 0;

  /**
   * Called when someone opens the Help panel: wakes the AI service (it sleeps when idle on the free plan) while
   * they type, so their first answer doesn't wait a minute. At most one ping a minute; nobody waits for it.
   */
  @Post('wake')
  @HttpCode(204)
  wake() {
    if (Date.now() - this.lastWake < 60_000) return;
    this.lastWake = Date.now();
    fetch(aiUrl('/health'), { signal: AbortSignal.timeout(90_000) }).catch(
      () => {},
    );
  }

  /** The FAQ page: the same help topics the assistant answers from, so the two can never disagree. */
  @Get('topics')
  async topics() {
    try {
      const res = await fetch(aiUrl('/support/topics'), {
        headers: aiHeaders(),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return (await res.json()) as { title: string; answer: string }[];
    } catch (err) {
      this.logger.error(`Help topics unavailable: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'The FAQ is unavailable right now.',
      );
    }
  }

  @Post('chat')
  @HttpCode(200)
  async chat(@Req() req: Request, @Body() dto: ChatDto) {
    if (!this.limiter.allow(req.ip ?? 'unknown')) {
      throw new HttpException(
        "You've sent a lot of messages. Please wait a few minutes, or use the Contact page.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Live AI counts against the daily cap; once it's used up, answers fall back to demo mode.
    let mode = dto.mode ?? 'demo';
    let notice: string | null = null;
    // Live AI is for signed-in users only, so anonymous visitors and bots can't spend the API budget.
    if (mode === 'ai' && !(await this.isSignedIn(req))) {
      mode = 'demo';
      notice = 'Sign in to use Live AI. This is a demo answer.';
    } else if (mode === 'ai' && !(await this.budget.take('chat'))) {
      mode = 'demo';
      notice =
        "Live AI has reached today's limit, so this is a demo answer. It resets at midnight UTC.";
    }
    let res: Response;
    try {
      res = await fetch(aiUrl('/support/chat'), {
        // A sleeping AI service takes about a minute to wake on the free plan; give it that long.
        signal: AbortSignal.timeout(90_000),
        method: 'POST',
        headers: aiHeaders({ 'Content-Type': 'application/json' }),
        // The session lets the AI service look up this user's bookings as this user, and nothing more.
        body: JSON.stringify({
          messages: dto.messages,
          timezone: dto.timezone ?? 'UTC',
          mode,
          session: req.cookies?.[COOKIE] ?? null,
        }),
      });
    } catch (err) {
      this.logger.error(`AI service unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "The assistant isn't available right now. Try again later, or use the Contact page.",
      );
    }
    if (!res.ok) {
      this.logger.error(
        `AI service answered ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
      // 502-504 come from the host while the service starts up or restarts.
      throw new ServiceUnavailableException(
        res.status >= 502
          ? 'The assistant is starting up. Try again in a minute.'
          : "The assistant couldn't answer that. Try again, or use the Contact page.",
      );
    }
    const body = (await res.json()) as {
      reply: string;
      mode: 'ai' | 'demo';
      model: string | null;
      notice: string | null;
    };
    return { ...body, notice: notice ?? body.notice };
  }

  private async isSignedIn(req: Request) {
    try {
      await this.auth.emailFor(req.cookies?.[COOKIE]);
      return true;
    } catch {
      return false;
    }
  }
}
