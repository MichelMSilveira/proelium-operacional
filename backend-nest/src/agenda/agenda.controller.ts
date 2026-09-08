import { Controller, Get, Req } from '@nestjs/common';
import { AgendaService } from './agenda.service';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.agenda.list(request.headers.cookie).then((items) => ({ appointments: items }));
  }
}
