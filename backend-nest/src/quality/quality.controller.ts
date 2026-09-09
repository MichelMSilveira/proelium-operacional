import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { QualityService } from './quality.service';

@Controller('quality')
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.quality.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.quality.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
