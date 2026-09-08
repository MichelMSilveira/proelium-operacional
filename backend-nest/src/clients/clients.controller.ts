import { Controller, Get, Req } from '@nestjs/common';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.clients.list(request.headers.cookie).then((items) => ({ clients: items }));
  }
}
