import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.equipment.list(request.headers.cookie);
  }

  @Get(':id/history')
  listHistory(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.equipment.history(id, request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.equipment.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.equipment.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post(':id/history')
  async createHistory(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.equipment.saveHistory(body, id, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id/history/:historyId')
  async updateHistory(@Param('id') id: string, @Param('historyId') historyId: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.equipment.saveHistory(body, id, request.headers.cookie, historyId);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete(':id/history/:historyId')
  async removeHistory(@Param('id') id: string, @Param('historyId') historyId: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.equipment.removeHistory(id, historyId, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
