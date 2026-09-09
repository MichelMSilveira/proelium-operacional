import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { CollaboratorsService } from './collaborators.service';

@Controller('collaborators')
export class CollaboratorsController {
  constructor(private readonly collaborators: CollaboratorsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.collaborators.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.collaborators.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.collaborators.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
