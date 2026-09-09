import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { InstallationsService } from './installations.service';

@Controller('installations')
export class InstallationsController {
  constructor(private readonly installations: InstallationsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.installations.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.installations.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.installations.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
