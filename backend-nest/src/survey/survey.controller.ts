import { Controller, Get, Req } from '@nestjs/common';
import { SurveyService } from './survey.service';

@Controller('survey')
export class SurveyController {
  constructor(private readonly survey: SurveyService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.survey.list(request.headers.cookie);
  }
}
