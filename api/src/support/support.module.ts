import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SupportController } from './support.controller.js';

@Module({ imports: [AuthModule], controllers: [SupportController] })
export class SupportModule {}
