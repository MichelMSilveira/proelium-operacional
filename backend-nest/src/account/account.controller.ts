import { Body, Controller, Get, Put, Req, Res } from '@nestjs/common';
import { Pool } from 'pg';

type RecordItem = Record<string, any>;

@Controller('account')
export class AccountController {
  private readonly pool?: Pool;
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);

  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
  }

  private async forward(path: string, method: string, request: { headers: { cookie?: string } }, payload?: unknown) {
    return fetch(`${this.legacyOrigin}${path}`, {
      method,
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }

  private async actor(request: { headers: { cookie?: string } }): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => null) as RecordItem | null;
    return body?.authenticated && body.user ? body.user as RecordItem : null;
  }

  private publicProfile(user: RecordItem): RecordItem {
    return {
      username: user.username, name: user.name || user.username, email: user.email || '',
      accountType: user.accountType || 'member', founder: user.accountType === 'founder' || user.founder === true,
      profileInfo: user.profileInfo || '', portfolio: Array.isArray(user.portfolio) ? user.portfolio : [],
      companyId: user.companyId || null,
    };
  }

  private async databaseProfile(request: { headers: { cookie?: string } }, response: any, payload?: unknown) {
    const actor = await this.actor(request);
    if (!actor) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
    const userResult = await this.pool!.query(
      `select username, name, email, company_id as "companyId", account_type as "accountType", founder,
              profile_info as "profileInfo", portfolio
       from app_users where username = $1 and active = true`,
      [actor.username],
    );
    const user = userResult.rows[0] as RecordItem | undefined;
    if (!user) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Perfil não encontrado.' }));
    if (payload === undefined) return response.status(200).type('application/json').send(JSON.stringify({ profile: this.publicProfile(user) }));

    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
    const name = String(input.name || '').trim().slice(0, 80);
    const profileInfo = String(input.profileInfo || '').trim().slice(0, 2000);
    if (!name) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Informe um nome para o perfil.' }));
    const saved = await this.pool!.query(
      `update app_users set name = $1, profile_info = $2, updated_at = now() where username = $3
       returning username, name, email, company_id as "companyId", account_type as "accountType", founder,
                 profile_info as "profileInfo", portfolio`,
      [name, profileInfo, actor.username],
    );
    return response.status(200).type('application/json').send(JSON.stringify({ ok: true, profile: this.publicProfile(saved.rows[0]) }));
  }

  @Get('profile')
  async profile(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseProfile(request, response); }
      catch (error) {
        console.error('Falha ao consultar perfil pessoal no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível consultar o perfil agora.' }));
      }
    }
    const upstream = await this.forward('/api/account/profile', 'GET', request);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Put('profile')
  async updateProfile(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseProfile(request, response, payload); }
      catch (error) {
        console.error('Falha ao atualizar perfil pessoal no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível atualizar o perfil agora.' }));
      }
    }
    const upstream = await this.forward('/api/account/profile', 'PUT', request, payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
