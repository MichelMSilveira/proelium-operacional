import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';

@Controller('auth')
export class AuthController {
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

  @Get('me')
  async me(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/auth/me`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    });
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Post('logout')
  async logout(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/auth/logout`, {
      method: 'POST',
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('login')
  async login(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/auth/login', 'POST', request, payload);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
