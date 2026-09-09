import { Controller, Get, Req } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.reports.list(request.headers.cookie);
  }
}
