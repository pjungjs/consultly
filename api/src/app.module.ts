import { Module } from '@nestjs/common';
import { AiBudgetModule } from './ai-budget/ai-budget.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BriefsModule } from './briefs/briefs.module.js';
import { HealthController } from './health.controller.js';
import { ConsultantsModule } from './consultants/consultants.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SupportModule } from './support/support.module.js';

@Module({
  imports: [
    PrismaModule,
    AiBudgetModule,
    ConsultantsModule,
    OrdersModule,
    AuthModule,
    BriefsModule,
    SupportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
