import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { SurveyService } from './survey.service';

@Controller('survey')
export class SurveyController {
  constructor(private readonly survey: SurveyService) {}

  @Get()
  list(@Req() request: { headers: { cookie?: string } }) {
    return this.survey.list(request.headers.cookie);
  }

  @Get(':id/rooms')
  rooms(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.survey.rooms(id, request.headers.cookie);
  }

  @Get(':id/dimensioning')
  dimensioning(@Param('id') id: string, @Req() request: { headers: { cookie?: string } }) {
    return this.survey.dimensioning(id, request.headers.cookie);
  }

  @Post(':id/dimensioning/confirm')
  async confirmDimensioning(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.confirmDimensioning(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Put(':id/rooms')
  async saveRooms(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.saveRooms(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post(':id/send-to-quote')
  async sendToQuote(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.sendToQuote(id, body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.saveSurvey(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.saveSurvey(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Post('points')
  async createPoint(@Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.savePoint(body, request.headers.cookie);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Patch('points/:id')
  async updatePoint(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.savePoint(body, request.headers.cookie, id);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }

  @Delete('points/:id')
  async removePoint(@Param('id') id: string, @Body() body: unknown, @Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.survey.removePoint(id, request.headers.cookie, body);
    response.status(upstream.status).type('application/json').send(upstream.body);
  }
}
