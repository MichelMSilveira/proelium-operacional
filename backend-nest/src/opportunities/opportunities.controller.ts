import { Controller, Get, Req } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.opportunities.list(request.headers.cookie).then((items) => ({ opportunities: items }));
  }
}
