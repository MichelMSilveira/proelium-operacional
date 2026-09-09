import { Controller, Get, Req } from '@nestjs/common';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.purchases.list(request.headers.cookie).then((items) => ({ purchases: items }));
  }
}
