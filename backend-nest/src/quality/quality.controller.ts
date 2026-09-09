import { Controller, Get, Req } from '@nestjs/common';
import { QualityService } from './quality.service';

@Controller('quality')
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.quality.list(request.headers.cookie).then((items) => ({ evaluations: items }));
  }
}
