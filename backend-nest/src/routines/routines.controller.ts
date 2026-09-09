import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { RoutinesService } from './routines.service';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.routines.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.routines.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.routines.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.routines.remove(request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
