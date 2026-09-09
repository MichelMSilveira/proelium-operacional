import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { DiagramService } from './diagram.service';

@Controller('diagram')
export class DiagramController {
  constructor(private readonly diagram: DiagramService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.diagram.list(request.headers.cookie);
  }

  @Post('connections')
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.diagram.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch('connections/:id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.diagram.save(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
