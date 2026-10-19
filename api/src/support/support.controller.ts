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
import { COOKIE } from '../auth/auth.controller.js';
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

  /** The FAQ page: the same help topics the assistant answers from, so the two can never disagree. */
  @Get('topics')
  async topics() {
    try {
      const res = await fetch(
        `${process.env.AI_URL ?? 'http://127.0.0.1:8000'}/support/topics`,
      );
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
    let res: Response;
    try {
      res = await fetch(
        `${process.env.AI_URL ?? 'http://127.0.0.1:8000'}/support/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The session lets the AI service look up this user's bookings as this user, and nothing more.
          body: JSON.stringify({
            messages: dto.messages,
            timezone: dto.timezone ?? 'UTC',
            mode: dto.mode ?? 'demo',
            session: req.cookies?.[COOKIE] ?? null,
          }),
        },
      );
    } catch (err) {
      this.logger.error(`AI service unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "The assistant isn't available right now. Try again later, or use the Contact page.",
      );
    }
    if (!res.ok)
      throw new ServiceUnavailableException(
        "The assistant couldn't answer that. Try again, or use the Contact page.",
      );
    return (await res.json()) as {
      reply: string;
      mode: 'ai' | 'demo';
      model: string | null;
      notice: string | null;
    };
  }
}
