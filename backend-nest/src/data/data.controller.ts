import { Body, Controller, Get, Put, Req, Res } from '@nestjs/common';

@Controller('data')
export class DataController {
  @Get()
  async read(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/data`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    });
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Put()
  async write(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/data`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
      },
      body: JSON.stringify(payload ?? {}),
    });
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }
}
