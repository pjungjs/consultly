import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { COOKIE } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';
import {
  BriefsService,
  MAX_BRIEF_BYTES,
  type UploadedPdf,
} from './briefs.service.js';

/** A client's PDF brief for one order, and the AI prep sheet made from it. */
@Controller('me/orders/:orderId/brief')
export class BriefsController {
  constructor(
    private readonly auth: AuthService,
    private readonly briefs: BriefsService,
  ) {}

  @Get()
  async get(@Req() req: Request, @Param('orderId') orderId: string) {
    return this.briefs.get(
      orderId,
      await this.auth.emailFor(req.cookies?.[COOKIE]),
    );
  }

  @Post()
  // Held in memory (max 10 MB), checked, then written to disk by the service.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BRIEF_BYTES, files: 1 },
    }),
  )
  async upload(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @UploadedFile() file?: UploadedPdf,
  ) {
    return this.briefs.upload(
      orderId,
      await this.auth.emailFor(req.cookies?.[COOKIE]),
      file,
    );
  }

  @Delete()
  async remove(@Req() req: Request, @Param('orderId') orderId: string) {
    return this.briefs.remove(
      orderId,
      await this.auth.emailFor(req.cookies?.[COOKIE]),
    );
  }

  /** The original PDF, shown in the browser's PDF viewer. */
  @Get('file')
  async file(
    @Req() req: Request,
    @Res() res: Response,
    @Param('orderId') orderId: string,
  ) {
    const { data, filename } = await this.briefs.file(
      orderId,
      await this.auth.emailFor(req.cookies?.[COOKIE]),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/[^\w.\- ]/g, '_')}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }
}
