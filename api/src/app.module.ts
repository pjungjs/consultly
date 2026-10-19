import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BriefsModule } from './briefs/briefs.module.js';
import { ConsultantsModule } from './consultants/consultants.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SupportModule } from './support/support.module.js';

@Module({
  imports: [
    PrismaModule,
    ConsultantsModule,
    OrdersModule,
    AuthModule,
    BriefsModule,
    SupportModule,
  ],
})
export class AppModule {}
