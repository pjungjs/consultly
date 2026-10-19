import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BriefsController } from './briefs.controller.js';
import { BriefsService } from './briefs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BriefsController],
  providers: [BriefsService],
})
export class BriefsModule {}
