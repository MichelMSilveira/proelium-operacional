import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.reports.list(request.headers.cookie);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.reports.save(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
