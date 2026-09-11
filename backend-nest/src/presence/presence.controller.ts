import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';

type RecordItem = Record<string, any>;
type RequestLike = { headers: { cookie?: string; 'user-agent'?: string } };

@Controller('presence')
export class PresenceController {
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4174}`;
  private readonly users = new Map<string, RecordItem>();

  private async authenticatedUser(cookie?: string): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => ({})) as RecordItem;
    return body.authenticated && body.user ? body.user : null;
  }

  private device(request: RequestLike, payload: RecordItem = {}): string {
    const explicit = String(payload.device || '').trim().slice(0, 80);
    if (explicit) return explicit;
    const agent = String(request.headers['user-agent'] || '').toLowerCase();
    if (agent.includes('android')) return 'Android';
    if (agent.includes('iphone') || agent.includes('ipad')) return 'iOS';
    if (agent.includes('windows')) return 'Windows';
    if (agent.includes('mac os')) return 'macOS';
    return 'Navegador';
  }

  private touch(user: RecordItem, request: RequestLike, payload: RecordItem = {}): RecordItem {
    const previous = this.users.get(user.username);
    const entry = {
      username: user.username,
      companyId: user.companyId || 'legacy',
      name: user.name || user.username,
      role: user.role || 'operador',
      device: this.device(request, payload),
      available: previous?.available !== false,
      lastSeen: Date.now(),
    };
    this.users.set(user.username, entry);
    return entry;
  }

  private payload(companyId: string): RecordItem[] {
    const now = Date.now();
    return [...this.users.values()]
      .filter(user => user.companyId === companyId && now - user.lastSeen < 90_000)
      .sort((left, right) => String(left.name).localeCompare(String(right.name), 'pt-BR'))
      .map(({ username, name, role, device, available }) => ({ username, name, role, device, devices: [device], sessions: 1, available: available !== false }));
  }

  private async user(request: RequestLike, response: any): Promise<RecordItem | null> {
    const authenticated = await this.authenticatedUser(request.headers.cookie);
    if (!authenticated) {
      response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      return null;
    }
    return authenticated;
  }

  @Get()
  async read(@Req() request: RequestLike, @Res() response: any) {
    const user = await this.user(request, response);
    if (!user) return;
    this.touch(user, request);
    return response.status(200).type('application/json').send(JSON.stringify({ users: this.payload(user.companyId || 'legacy') }));
  }

  @Post('heartbeat')
  async heartbeat(@Req() request: RequestLike, @Body() payload: unknown, @Res() response: any) {
    try {
      const user = await this.user(request, response);
      if (!user) return;
      const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
      this.touch(user, request, input);
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, users: this.payload(user.companyId || 'legacy') }));
    } catch (error) {
      console.error('Falha ao atualizar presença no NestJS:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Heartbeat inválido.' }));
    }
  }

  @Post('availability')
  async availability(@Req() request: RequestLike, @Body() payload: unknown, @Res() response: any) {
    try {
      const user = await this.user(request, response);
      if (!user) return;
      const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
      const entry = this.touch(user, request, input);
      entry.available = input.available !== false;
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, users: this.payload(user.companyId || 'legacy') }));
    } catch (error) {
      console.error('Falha ao atualizar disponibilidade no NestJS:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Disponibilidade inválida.' }));
    }
  }
}
