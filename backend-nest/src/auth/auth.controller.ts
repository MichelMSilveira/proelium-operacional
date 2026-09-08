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

  @Get('google')
  async google(@Req() request: { headers: { cookie?: string }; url?: string }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const query = request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    const upstream = await fetch(`${origin}/api/auth/google${query}`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
      redirect: 'manual',
    });
    const location = upstream.headers.get('location');
    if (location) response.setHeader('location', location);
    response.status(upstream.status).send();
  }

  @Get('google/callback')
  async googleCallback(@Req() request: { headers: { cookie?: string }; url?: string }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const query = request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    const upstream = await fetch(`${origin}/api/auth/google/callback${query}`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
      redirect: 'manual',
    });
    const location = upstream.headers.get('location');
    const setCookie = upstream.headers.get('set-cookie');
    if (location) response.setHeader('location', location);
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).send(await upstream.text());
  }

  @Get('google/pending')
  async googlePending(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/auth/google/pending', 'GET', request);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('consume-invite')
  async consumeInvite(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/auth/consume-invite', 'POST', request);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('register-company')
  async registerCompany(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/auth/register-company', 'POST', request, payload);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('register-google-company')
  async registerGoogleCompany(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/auth/register-google-company', 'POST', request, payload);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
