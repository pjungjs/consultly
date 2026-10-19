import { Module } from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DemoService } from './demo.service.js';
import { AvailabilityController } from './availability.controller.js';
import { ProfileController } from './profile.controller.js';

@Module({
  imports: [OrdersModule],
  controllers: [AuthController, AvailabilityController, ProfileController],
  providers: [AuthService, DemoService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
