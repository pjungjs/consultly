import { type ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { Prisma } from './generated/prisma/client.js';

// Prisma codes for "the database can't be reached": unreachable, timed out, connection closed.
const UNREACHABLE = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

export const isDatabaseDown = (err: unknown) =>
  err instanceof Prisma.PrismaClientInitializationError ||
  (err instanceof Prisma.PrismaClientKnownRequestError &&
    UNREACHABLE.has(err.code));

/**
 * When the database is down (e.g. a paused Supabase project), every request would fail with a generic 500.
 * This answers 503 with a plain message instead, and logs one clear line to search for in the host's logs.
 * Every other error is handled as usual.
 */
@Catch()
export class DatabaseDownFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(err: unknown, host: ArgumentsHost) {
    if (!isDatabaseDown(err)) return super.catch(err, host);
    this.logger.error(
      `DATABASE UNREACHABLE: ${(err as Error).message.trim().split('\n').at(-1)}`,
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'Consultly is temporarily unavailable. Please try again in a few minutes.',
      });
  }
}
