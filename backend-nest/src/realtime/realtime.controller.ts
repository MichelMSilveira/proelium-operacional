import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type RecordItem = Record<string, any>;

@Controller()
export class RealtimeController {
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4174}`;

  private async authenticatedUser(cookie?: string): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => ({})) as RecordItem;
    return body.authenticated && body.user ? body.user : null;
  }

  private publicUser(user: RecordItem): RecordItem {
    return { username: user.username, name: user.name || user.username, role: user.role, companyId: user.companyId || 'legacy' };
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
