import { Controller, Get, Req } from '@nestjs/common';
import { CollaboratorsService } from './collaborators.service';

@Controller('collaborators')
export class CollaboratorsController {
  constructor(private readonly collaborators: CollaboratorsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.collaborators.list(request.headers.cookie).then((items) => ({ collaborators: items }));
  }
}
