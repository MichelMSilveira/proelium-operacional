import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type RecordItem = Record<string, any>;

@Controller()
export class RealtimeController {
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4174}`;
  private readonly eventSecret = process.env.SESSION_SECRET || 'proelium-development-session-secret-change-me';
  private readonly clients = new Set<RecordItem>();

  constructor() {
    const timer = setInterval(() => {
      for (const client of this.clients) {
        try { client.response.write(': keep-alive\n\n'); } catch { this.clients.delete(client); }
      }
    }, 25_000);
    timer.unref?.();
  }

  private async authenticatedUser(cookie?: string): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => ({})) as RecordItem;
    return body.authenticated && body.user ? body.user : null;
  }

  private publicUser(user: RecordItem): RecordItem {
    return { username: user.username, name: user.name || user.username, role: user.role, companyId: user.companyId || 'legacy' };
  }

  private writeEvent(client: RecordItem, name: string, payload: RecordItem): void {
    try { client.response.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { this.clients.delete(client); }
  }

  private broadcast(name: string, payload: RecordItem, companyId?: string | null): void {
    for (const client of this.clients) {
      if (companyId !== null && companyId !== undefined && client.companyId !== companyId) continue;
      if (name === 'collaboration-request' && client.role !== 'admin') continue;
      if (name === 'assistance-request' && (client.username === payload.from?.username || client.available === false)) continue;
      if (name === 'presence-updated' && Array.isArray(payload.users)) {
        const current = payload.users.find((user: RecordItem) => user?.username === client.username);
        if (current) {
          client.available = current.available !== false;
          if (current.device) client.device = current.device;
        }
      }
      this.writeEvent(client, name, payload);
    }
  }

  @Get('events')
  async events(@Req() request: { headers: { cookie?: string; 'user-agent'?: string }; on: Function }, @Res() response: any) {
    const user = await this.authenticatedUser(request.headers.cookie);
    if (!user) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 3000\n\n');
    const client = {
      response,
      username: user.username,
      companyId: user.companyId || 'legacy',
      role: user.role,
      available: true,
      device: String(request.headers['user-agent'] || '').slice(0, 80),
    };
    this.clients.add(client);
    request.on('close', () => this.clients.delete(client));
  }

  @Post('events/publish')
  publish(@Req() request: { headers: Record<string, string | string[] | undefined> }, @Body() payload: unknown, @Res() response: any) {
    if (String(request.headers['x-proelium-event-secret'] || '') !== this.eventSecret) return response.status(401).type('application/json').send(JSON.stringify({ error: 'Não autorizado.' }));
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
    const name = String(input.name || '').trim().slice(0, 80);
    const companyId = input.companyId === null || input.companyId === undefined ? null : String(input.companyId);
    const eventPayload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload as RecordItem : {};
    if (!name) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Evento inválido.' }));
    this.broadcast(name, eventPayload, companyId);
    return response.status(202).type('application/json').send(JSON.stringify({ ok: true }));
  }

  private async createRequest(path: 'collaboration' | 'assistance', request: { headers: { cookie?: string } }, payload: unknown, response: any) {
    try {
      const user = await this.authenticatedUser(request.headers.cookie);
      if (!user) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
      const message = String(input.message || '').trim().slice(0, 500);
      if (!message) return response.status(400).type('application/json').send(JSON.stringify({ error: path === 'collaboration' ? 'Descreva como deseja colaborar.' : 'Descreva o auxílio necessário.' }));
      const item = { id: randomUUID(), from: this.publicUser(user), message, at: new Date().toISOString(), type: path };
      return response.status(202).type('application/json').send(JSON.stringify({ ok: true, request: item }));
    } catch (error) {
      console.error(`Falha ao criar pedido de ${path} no NestJS:`, error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: path === 'collaboration' ? 'Pedido de colaboração inválido.' : 'Pedido de auxílio inválido.' }));
    }
  }

  @Post('collaboration-requests')
  collaboration(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    return this.createRequest('collaboration', request, payload, response);
  }

  @Post('assistance-requests')
  assistance(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    return this.createRequest('assistance', request, payload, response);
  }
}
