import { Controller, Get, Req } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.knowledge.list(request.headers.cookie).then((items) => ({ articles: items }));
  }
}
