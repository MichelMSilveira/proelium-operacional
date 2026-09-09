import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { AgendaService } from './agenda.service';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.agenda.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.agenda.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.agenda.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.agenda.remove(id, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
