import { Controller, Get, Req } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.projects.list(request.headers.cookie).then((items) => ({ projects: items }));
  }
}
