import { Controller, Get, Req, Res } from '@nestjs/common';

@Controller('clients')
export class ClientsController {
  @Get()
  async list(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/data`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    });
    if (!upstream.ok) {
      response.status(upstream.status).type('application/json').send(await upstream.text());
      return;
    }
    const payload = await upstream.json() as { data?: { clients?: unknown[] } };
    response.status(200).json({ clients: payload.data?.clients || [] });
  }
}
