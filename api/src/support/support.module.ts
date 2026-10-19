import { Module } from '@nestjs/common';
import { SupportController } from './support.controller.js';

@Module({ controllers: [SupportController] })
export class SupportModule {}
