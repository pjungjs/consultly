import { Module } from '@nestjs/common';
import { ConsultantsController } from './consultants.controller.js';
import { ConsultantsService } from './consultants.service.js';

@Module({
  controllers: [ConsultantsController],
  providers: [ConsultantsService],
  exports: [ConsultantsService],
})
export class ConsultantsModule {}
