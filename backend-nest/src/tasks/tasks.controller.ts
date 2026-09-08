import { Controller, Get, Req } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.tasks.list(request.headers.cookie).then((items) => ({ tasks: items }));
  }
}
