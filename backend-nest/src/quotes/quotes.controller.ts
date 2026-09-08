import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.quotes.list(request.headers.cookie).then((items) => ({ quotes: items }));
  }

  @Put()
  save(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }) {
    return this.quotes.save(body, request.headers.cookie);
  }
}
