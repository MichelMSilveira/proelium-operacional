import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
const companyTrialModules: Record<string, string[]> = {
  contratante: ['dashboard', 'commercial', 'quotes', 'clients', 'products', 'projects', 'processes', 'tasks', 'agenda', 'operations', 'reports', 'finance', 'bi', 'biMarket', 'quality', 'collaborators', 'equipment', 'knowledge', 'routines'],
  contratado: ['dashboard', 'clients', 'projects', 'processes', 'tasks', 'agenda', 'operations', 'reports', 'quality', 'collaborators', 'equipment', 'execution', 'knowledge', 'routines'],
  residencial: ['dashboard', 'clients', 'projects', 'agenda', 'operations', 'reports', 'quality', 'equipment', 'knowledge'],
};
const allCompanyTrialModules = ['dashboard', 'commercial', 'survey', 'quotes', 'clients', 'products', 'productConnections', 'productLibrary', 'projects', 'purchases', 'diagram', 'installations', 'execution', 'quality', 'operations', 'equipment', 'agenda', 'tasks', 'finance', 'reports', 'bi', 'biMarket', 'collaborators', 'knowledge', 'routines'];

@Controller('auth')
export class AuthController {
  private readonly pool?: Pool;
  private readonly sessionSecret = process.env.SESSION_SECRET || 'proelium-development-session-secret-change-me';

  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
  }

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
    if (this.pool) {
      try {
        const user = await this.databaseUser(request.headers.cookie);
        return response.status(user ? 200 : 401).type('application/json').send(JSON.stringify(user ? { authenticated: true, user } : { authenticated: false }));
      } catch (error) {
        console.error('Falha ao consultar sessão PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ authenticated: false, error: 'Não foi possível validar a sessão agora.' }));
      }
    }
    const origin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
    const upstream = await fetch(`${origin}/api/auth/me`, {
      headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
    });
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  private async databaseUser(cookie?: string): Promise<RecordItem | null> {
    const session = this.verifySession(cookie);
    if (!session?.username) return null;
    const result = await this.pool!.query(
      `select username, name, role, active, email, company_id as "companyId", account_type as "accountType",
              founder, profile_info as "profileInfo", portfolio, modules,
              company_access_override as "companyAccessOverride"
       from app_users where username = $1 and active = true`,
      [session.username],
    );
    const stored = result.rows[0] as RecordItem | undefined;
    if (!stored || (session.email && stored.email && String(session.email).toLowerCase() !== String(stored.email).toLowerCase())) return null;
    const companyId = stored.companyId || 'legacy';
    let company: RecordItem | undefined;
    if (companyId !== 'legacy') {
      const companyResult = await this.pool!.query(
        `select id, status, access_level as "accessLevel", license_status as "licenseStatus", company_type as "companyType", modules
         from companies where id = $1`,
        [companyId],
      );
      company = companyResult.rows[0] as RecordItem | undefined;
    }
    const merged = {
      ...session,
      ...stored,
      email: stored.email || session.email || '',
      name: stored.name || session.name || stored.username,
      role: stored.role || session.role || 'operador',
      companyId,
      accessLevel: this.isPortfolio(stored) || this.isFounder(stored) ? 'full' : (stored.accessLevel || session.accessLevel || company?.accessLevel || (companyId === 'legacy' ? 'full' : 'limited')),
      licenseStatus: this.isPortfolio(stored) ? 'approved' : (stored.licenseStatus || session.licenseStatus || company?.licenseStatus || (companyId === 'legacy' ? 'approved' : 'pending')),
      companyStatus: this.isPortfolio(stored) ? 'approved' : (stored.companyStatus || session.companyStatus || company?.status || (companyId === 'legacy' ? 'approved' : 'pending')),
      modules: this.isPortfolio(stored) ? [] : this.membershipModules(stored, company, Array.isArray(session.modules) ? session.modules : []),
      companyAccessOverride: stored.companyAccessOverride || session.companyAccessOverride || null,
      accountType: stored.accountType || (this.isPlatformAdmin(stored) ? 'support' : (companyId === 'legacy' ? 'support' : 'member')),
      founder: stored.founder === true || session.founder === true,
      profileInfo: stored.profileInfo || session.profileInfo || '',
      portfolio: Array.isArray(stored.portfolio) ? stored.portfolio : (Array.isArray(session.portfolio) ? session.portfolio : []),
    };
    return this.publicUser(merged);
  }

  private verifySession(cookie?: string): RecordItem | null {
    const token = String(cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('proelium_session='))?.slice('proelium_session='.length);
    if (!token) return null;
    let value: string;
    try { value = decodeURIComponent(token); } catch { return null; }
    const [encoded, signature] = value.split('.');
    if (!encoded || !signature) return null;
    const expected = createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as RecordItem;
      return Number(payload.expiresAt) >= Date.now() ? payload : null;
    } catch { return null; }
  }

  private membershipModules(user: RecordItem, company: RecordItem | undefined, fallback: string[]): string[] {
    if (company && this.isFounder(user)) return allCompanyTrialModules;
    if (Array.isArray(user.modules) && user.modules.length) {
      return user.role === 'comercial' ? [...new Set([...user.modules, ...rolePermissions.comercial])] : user.modules;
    }
    if (company?.status === 'pending') {
      const available = companyTrialModules[company.companyType] || companyTrialModules.contratado;
      return available.filter((item) => this.permissionsFor(user.role).includes('*') || this.permissionsFor(user.role).includes(item));
    }
    if (Array.isArray(company?.modules) && company.modules.length) return company.modules;
    return fallback.length ? fallback : this.permissionsFor(user.role);
  }

  private publicUser(user: RecordItem): RecordItem {
    const role = user.role === 'operador' ? 'operacao' : (rolePermissions[user.role] ? user.role : 'operacao');
    const platformAdmin = this.isPlatformAdmin(user);
    const companyScoped = Boolean(user.companyId && user.companyId !== 'legacy');
    const supportUser = !platformAdmin && !this.isPortfolio(user) && !companyScoped && (user.role === 'suporte' || user.role === 'admin');
    const companyFullAccess = companyScoped && user.companyAccessOverride === 'full';
    const rolePermissionList = this.permissionsFor(role);
    const storedModules = Array.isArray(user.modules) && user.modules.length ? user.modules : rolePermissionList;
    const effectiveModules = role === 'comercial' && companyScoped ? [...new Set([...storedModules, ...rolePermissionList])] : storedModules;
    const permissions = companyFullAccess ? ['*'] : (rolePermissionList[0] === '*' ? effectiveModules : rolePermissionList.filter((item) => effectiveModules.includes(item)));
    const portfolioUser = this.isPortfolio(user);
    return {
      username: user.username, name: user.name || user.username, email: user.email || '', role: user.role || 'operador',
      roleLabel: supportUser ? 'Suporte da plataforma' : portfolioUser ? 'Perfil pessoal' : roleLabels[role],
      scope: platformAdmin ? 'platform' : companyScoped ? 'company' : supportUser ? 'support' : portfolioUser ? 'portfolio' : 'legacy',
      platformAdmin, supportUser, portfolioUser, accountType: user.accountType || 'member', founder: this.isFounder(user),
      permissions: portfolioUser ? [] : permissions, modules: portfolioUser ? [] : effectiveModules,
      companyAccessOverride: companyFullAccess ? 'full' : null, portfolioCount: Array.isArray(user.portfolio) ? user.portfolio.length : 0,
      accessLevel: portfolioUser || this.isFounder(user) ? 'full' : (user.accessLevel || (companyScoped ? 'limited' : 'full')),
      licenseStatus: portfolioUser ? 'approved' : (user.licenseStatus || (companyScoped ? 'pending' : 'approved')),
      companyStatus: portfolioUser ? 'approved' : (user.companyStatus || 'approved'), active: user.active !== false,
      companyId: portfolioUser ? null : (user.companyId || 'legacy'),
    };
  }

  private permissionsFor(role: string): string[] { return rolePermissions[role === 'operador' ? 'operacao' : role] || rolePermissions.operacao; }
  private isPortfolio(user: RecordItem): boolean { return user.accountType === 'portfolio'; }
  private isFounder(user: RecordItem): boolean { return user.accountType === 'founder' || user.founder === true; }
  private isPlatformAdmin(user: RecordItem): boolean {
    const admins = String(process.env.PROELIUM_PLATFORM_ADMINS || 'admin').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    return admins.includes(String(user.username || '').toLowerCase()) || admins.includes(String(user.email || '').toLowerCase());
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

  @Post('join-google-company')
  async joinGoogleCompany(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/auth/join-google-company', 'POST', request);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
