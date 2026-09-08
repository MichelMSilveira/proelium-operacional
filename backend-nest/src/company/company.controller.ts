import { Body, Controller, Get, Put, Req, Res } from '@nestjs/common';

@Controller('company')
export class CompanyController {
  private async forward(path: string, method: string, request: { headers: { cookie?: string } }, payload?: unknown) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    return fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }

  @Get('profile')
  async profile(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/company/profile', 'GET', request);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Put('profile')
  async updateProfile(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/company/profile', 'PUT', request, payload);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Get('routines')
  async routines(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/company/routines', 'GET', request);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Put('routines')
  async updateRoutines(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/company/routines', 'PUT', request, payload);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }
}
