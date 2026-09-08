import { Controller, Get, Req } from '@nestjs/common';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.operations.list(request.headers.cookie).then((items) => ({ serviceOrders: items }));
  }
}
