import { Controller, Get, Req } from '@nestjs/common';
import { InstallationsService } from './installations.service';

@Controller('installations')
export class InstallationsController {
  constructor(private readonly installations: InstallationsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.installations.list(request.headers.cookie).then((items) => ({ installations: items }));
  }
}
