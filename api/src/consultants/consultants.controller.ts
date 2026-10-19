import { Controller, Get, Param } from '@nestjs/common';
import { ConsultantsService } from './consultants.service.js';

@Controller('consultants')
export class ConsultantsController {
  constructor(private readonly consultants: ConsultantsService) {}

  @Get()
  list() {
    return this.consultants.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.consultants.get(id);
  }

  @Get(':id/slots')
  slots(@Param('id') id: string) {
    return this.consultants.slots(id);
  }
}
