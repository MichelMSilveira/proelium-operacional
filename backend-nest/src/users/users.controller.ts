import { Body, Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';

@Controller('auth/users')
export class UsersController {
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

  @Get()
  async list(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/auth/users`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    });
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Post()
  async create(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/auth/users', 'POST', request, payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Delete()
  async remove(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/auth/users', 'DELETE', request, payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}

@Controller('company/users')
export class CompanyUsersController {
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

  @Get()
  async list(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/company/users', 'GET', request);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post()
  async create(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/company/users', 'POST', request, payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Delete()
  async remove(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/company/users', 'DELETE', request, payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
