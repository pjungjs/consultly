import { Global, Module } from '@nestjs/common';
import { AiBudgetService } from './ai-budget.service.js';

@Global()
@Module({ providers: [AiBudgetService], exports: [AiBudgetService] })
export class AiBudgetModule {}
