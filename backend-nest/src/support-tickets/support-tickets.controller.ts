import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTickets: SupportTicketsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.supportTickets.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.supportTickets.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.supportTickets.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
