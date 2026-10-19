import { Controller, Get } from '@nestjs/common';

/** For the host's health checks and uptime pings (it also keeps a free server from going to sleep). */
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}
