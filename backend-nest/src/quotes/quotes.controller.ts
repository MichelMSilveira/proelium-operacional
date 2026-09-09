import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.quotes.list(request.headers.cookie);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.quotes.detail(id, request.headers.cookie);
  }

  @Get(':id/rooms')
  rooms(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.quotes.rooms(id, request.headers.cookie).then((items) => ({ rooms: items }));
  }

  @Get(':id/items')
  items(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.quotes.items(id, request.headers.cookie);
  }

  @Post(':id/items')
  async addItem(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.addItem(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id/items/:itemId')
  async updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.updateItem(id, itemId, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete(':id/items/:itemId')
  async deleteItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.deleteItem(id, itemId, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post(':id/rooms')
  async createRoom(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.createRoom(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id/rooms/:roomId')
  async updateRoom(@Param('id') id: string, @Param('roomId') roomId: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.updateRoom(id, roomId, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete(':id/rooms/:roomId')
  async deleteRoom(@Param('id') id: string, @Param('roomId') roomId: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.deleteRoom(id, roomId, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
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

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.updateQuote(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quotes.deleteQuote(id, body, request.headers.cookie);
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
