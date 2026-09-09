import { Controller, Get, Req } from '@nestjs/common';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.finance.list(request.headers.cookie).then((items) => ({ entries: items }));
  }
}
