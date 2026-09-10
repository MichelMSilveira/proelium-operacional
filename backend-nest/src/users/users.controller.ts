import { Body, Controller, Delete, Get, Post, Query, Req, Res } from '@nestjs/common';
import { randomBytes, scryptSync } from 'node:crypto';
import { Pool } from 'pg';

type RecordItem = Record<string, any>;

const roleLabels: Record<string, string> = {
  admin: 'Administrador', suporte: 'Suporte da plataforma', comercial: 'Comercial', operacao: 'Operação',
  financeiro: 'Financeiro', leitura: 'Leitura', operador: 'Operação',
};
const rolePermissions: Record<string, string[]> = {
  admin: ['*'], suporte: [],
  comercial: ['dashboard', 'clients', 'commercial', 'quotes', 'products', 'survey'],
  operacao: ['dashboard', 'projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'reports', 'execution', 'diagram', 'quality', 'collaborators', 'equipment', 'knowledge'],
  financeiro: ['dashboard', 'clients', 'projects', 'commercial', 'finance', 'bi', 'biMarket', 'knowledge'],
  leitura: ['dashboard', 'projects', 'installations', 'knowledge', 'bi', 'biMarket'],
};

@Controller('auth/users')
export class UsersController {
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

  private isPlatformAdmin(user: RecordItem): boolean {
    const admins = String(process.env.PROELIUM_PLATFORM_ADMINS || 'admin').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    return admins.includes(String(user.username || '').toLowerCase()) || admins.includes(String(user.email || '').toLowerCase());
  }

  private permissionsFor(role: string): string[] {
    return rolePermissions[role === 'operador' ? 'operacao' : role] || rolePermissions.operacao;
  }

  private publicUser(user: RecordItem): RecordItem {
    const role = user.role === 'operador' ? 'operacao' : (rolePermissions[user.role] ? user.role : 'operacao');
    const platformAdmin = this.isPlatformAdmin(user);
    const companyScoped = Boolean(user.companyId && user.companyId !== 'legacy');
    const supportUser = !platformAdmin && !companyScoped && (user.role === 'suporte' || user.role === 'admin');
    const companyFullAccess = companyScoped && user.companyAccessOverride === 'full';
    const rolePermissionList = this.permissionsFor(role);
    const storedModules = Array.isArray(user.modules) && user.modules.length ? user.modules : rolePermissionList;
    const effectiveModules = role === 'comercial' && companyScoped ? [...new Set([...storedModules, ...rolePermissionList])] : storedModules;
    const permissions = companyFullAccess ? ['*'] : (rolePermissionList[0] === '*' ? effectiveModules : rolePermissionList.filter((item) => effectiveModules.includes(item)));
    const portfolioUser = user.accountType === 'portfolio';
    const founder = user.accountType === 'founder' || user.founder === true;
    return {
      username: user.username, name: user.name || user.username, email: user.email || '', role: user.role || 'operador',
      roleLabel: supportUser ? 'Suporte da plataforma' : portfolioUser ? 'Perfil pessoal' : roleLabels[role],
      scope: platformAdmin ? 'platform' : companyScoped ? 'company' : supportUser ? 'support' : portfolioUser ? 'portfolio' : 'legacy',
      platformAdmin, supportUser, portfolioUser, accountType: user.accountType || 'member', founder,
      permissions: portfolioUser ? [] : permissions, modules: portfolioUser ? [] : effectiveModules,
      companyAccessOverride: companyFullAccess ? 'full' : null, portfolioCount: Array.isArray(user.portfolio) ? user.portfolio.length : 0,
      accessLevel: portfolioUser || founder ? 'full' : (user.accessLevel || (companyScoped ? 'limited' : 'full')),
      licenseStatus: portfolioUser ? 'approved' : (user.licenseStatus || (companyScoped ? 'pending' : 'approved')),
      companyStatus: portfolioUser ? 'approved' : (user.companyStatus || 'approved'), active: user.active !== false,
      companyId: portfolioUser ? null : (user.companyId || 'legacy'),
    };
  }

  private passwordRecord(password: string): { salt: string; passwordHash: string } {
    const salt = randomBytes(16);
    return { salt: salt.toString('base64'), passwordHash: scryptSync(password, salt, 64).toString('base64') };
  }

  private async databaseList(request: { headers: { cookie?: string } }, response: any) {
    const actor = await this.actor(request);
    if (!actor) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
    if (actor.role !== 'admin' || !this.isPlatformAdmin(actor)) return response.status(403).type('application/json').send(JSON.stringify({ error: 'Apenas administradores da plataforma podem gerenciar usuários globais.' }));
    const result = await this.pool!.query(
      `select username, name, role, active, email, company_id as "companyId", account_type as "accountType",
              founder, profile_info as "profileInfo", portfolio, modules,
              company_access_override as "companyAccessOverride"
       from app_users where (company_id is null or company_id = 'legacy') and account_type <> 'portfolio' order by username`,
    );
    return response.status(200).type('application/json').send(JSON.stringify({ users: result.rows.map((user) => this.publicUser({ ...user, portfolio: user.portfolio || [], modules: user.modules || [] })) }));
  }

  private async databaseMutation(request: { headers: { cookie?: string } }, payload: unknown, method: string, response: any, usernameQuery?: string) {
    const actor = await this.actor(request);
    if (!actor) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
    if (actor.role !== 'admin' || !this.isPlatformAdmin(actor)) return response.status(403).type('application/json').send(JSON.stringify({ error: 'Apenas administradores da plataforma podem gerenciar usuários globais.' }));
    try {
      const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
      const username = String(usernameQuery || input.username || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Usuário inválido.' }));
      const result = await this.pool!.query(
        `select username, name, role, active, email, company_id as "companyId", salt,
                password_hash as "passwordHash", account_type as "accountType", founder,
                profile_info as "profileInfo", portfolio, modules,
                company_access_override as "companyAccessOverride", created_at as "createdAt"
         from app_users where username = $1`,
        [username],
      );
      const existing = result.rows[0] as RecordItem | undefined;
      if (method === 'DELETE') {
        if (username === actor.username) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Você não pode excluir o próprio usuário.' }));
        if (!existing) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Usuário não encontrado.' }));
        if (existing.accountType === 'portfolio') return response.status(403).type('application/json').send(JSON.stringify({ error: 'Perfis pessoais não são gerenciados no painel de suporte.' }));
        if (existing.role === 'admin') {
          const admins = await this.pool!.query(`select count(*)::int as count from app_users where role = 'admin' and active = true`);
          if (Number(admins.rows[0]?.count || 0) <= 1) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Mantenha pelo menos um administrador ativo.' }));
        }
        await this.pool!.query('delete from app_users where username = $1', [username]);
        return response.status(200).type('application/json').send(JSON.stringify({ ok: true }));
      }
      if (existing?.accountType === 'portfolio') return response.status(409).type('application/json').send(JSON.stringify({ error: 'Perfis pessoais devem ser gerenciados pelo próprio usuário.' }));
      if (existing?.companyId && existing.companyId !== 'legacy') return response.status(409).type('application/json').send(JSON.stringify({ error: 'Usuários de empresas devem ser gerenciados pela própria empresa.' }));
      const password = String(input.password || '');
      if (!existing && password.length < 10) return response.status(400).type('application/json').send(JSON.stringify({ error: 'A senha deve ter pelo menos 10 caracteres.' }));
      if (input.role && !Object.keys(rolePermissions).includes(String(input.role))) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Papel inválido.' }));
      const email = String(input.email || existing?.email || '').trim().toLowerCase();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return response.status(400).type('application/json').send(JSON.stringify({ error: 'E-mail inválido.' }));
      const role = this.isPlatformAdmin(existing || { username }) ? 'admin' : String(input.role || existing?.role || 'operador');
      const next = {
        username, name: String(input.name || username).trim().slice(0, 80), role, active: input.active !== false, email: email || null,
        companyId: null, accountType: role === 'suporte' ? 'support' : (existing?.accountType || 'support'), founder: false,
        profileInfo: existing?.profileInfo || '', portfolio: existing?.portfolio || [], modules: [], companyAccessOverride: null,
        salt: existing?.salt || '', passwordHash: existing?.passwordHash || '', createdAt: existing?.createdAt || null,
      };
      if (password) {
        if (password.length < 10) return response.status(400).type('application/json').send(JSON.stringify({ error: 'A senha deve ter pelo menos 10 caracteres.' }));
        Object.assign(next, this.passwordRecord(password));
      }
      const saved = await this.pool!.query(
        `insert into app_users (username, name, role, active, email, company_id, account_type, founder, profile_info, portfolio, modules, company_access_override, salt, password_hash, created_at, updated_at)
         values ($1, $2, $3, $4, $5, null, $6, false, $7, $8::jsonb, $9::jsonb, null, $10, $11, coalesce($12::timestamptz, now()), now())
         on conflict (username) do update set name = excluded.name, role = excluded.role, active = excluded.active,
           email = excluded.email, company_id = null, account_type = excluded.account_type, founder = false,
           profile_info = excluded.profile_info, portfolio = excluded.portfolio, modules = excluded.modules,
           company_access_override = null, salt = excluded.salt, password_hash = excluded.password_hash, updated_at = now()
         returning username, name, role, active, email, company_id as "companyId", account_type as "accountType", founder,
                   profile_info as "profileInfo", portfolio, modules, company_access_override as "companyAccessOverride"`,
        [next.username, next.name, next.role, next.active, next.email, next.accountType, next.profileInfo, JSON.stringify(next.portfolio), JSON.stringify(next.modules), next.salt, next.passwordHash, next.createdAt],
      );
      return response.status(existing ? 200 : 201).type('application/json').send(JSON.stringify({ ok: true, user: this.publicUser({ ...saved.rows[0], portfolio: saved.rows[0].portfolio || [], modules: saved.rows[0].modules || [] }) }));
    } catch (error) {
      console.error('Falha ao gerenciar usuários no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Dados de usuário inválidos.' }));
    }
  }

  @Get()
  async list(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (!this.pool) {
      const upstream = await this.forward('/api/auth/users', 'GET', request);
      return response.status(upstream.status).type('application/json').send(await upstream.text());
    }
    try { return await this.databaseList(request, response); }
    catch (error) {
      console.error('Falha ao listar usuários no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(503).type('application/json').send(JSON.stringify({ error: 'Armazenamento temporariamente indisponível.' }));
    }
  }

  @Post()
  async create(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (!this.pool) {
      const upstream = await this.forward('/api/auth/users', 'POST', request, payload);
      return response.status(upstream.status).type('application/json').send(await upstream.text());
    }
    return this.databaseMutation(request, payload, 'POST', response);
  }

  @Delete()
  async remove(@Req() request: { headers: { cookie?: string } }, @Query('username') username: string, @Res() response: any) {
    if (!this.pool) {
      const upstream = await this.forward(`/api/auth/users?username=${encodeURIComponent(username || '')}`, 'DELETE', request);
      return response.status(upstream.status).type('application/json').send(await upstream.text());
    }
    return this.databaseMutation(request, {}, 'DELETE', response, username);
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
    const username = payload && typeof payload === 'object' ? String((payload as { username?: unknown }).username || '') : '';
    const upstream = await this.forward(`/api/company/users?username=${encodeURIComponent(username)}`, 'DELETE', request, payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
