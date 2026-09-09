import { Body, Controller, Get, Param, Post, Put, Req, Res } from '@nestjs/common';
import { QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.quotes.list(request.headers.cookie).then((items) => ({ quotes: items }));
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.quotes.detail(id, request.headers.cookie);
  }

  @Get(':id/rooms')
  rooms(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.quotes.rooms(id, request.headers.cookie).then((items) => ({ rooms: items }));
  }

  @Put(':id/rooms')
  async saveRooms(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.saveRooms(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.approve(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Put()
  async save(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.createFromResource(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
