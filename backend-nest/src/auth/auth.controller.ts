import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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
  private readonly loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();
  private readonly sessionTtlSeconds = 30 * 24 * 60 * 60;

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
  async logout(@Req() request: { headers: { cookie?: string; [key: string]: string | undefined } }, @Res() response: any) {
    const secure = request.headers['x-forwarded-proto'] === 'https' || request.headers.host?.startsWith('app.');
    response.setHeader('set-cookie', `proelium_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    response.status(200).type('application/json').send(JSON.stringify({ ok: true }));
  }

  @Post('login')
  async login(@Req() request: { headers: { cookie?: string; [key: string]: string | undefined } }, @Body() payload: unknown, @Res() response: any) {
    if (this.pool) return this.databaseLogin(request, payload, response);
    const upstream = await this.forward('/api/auth/login', 'POST', request, payload);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  private async databaseLogin(request: { headers: { cookie?: string; [key: string]: string | undefined } }, payload: unknown, response: any) {
    try {
      const input = this.payloadRecord(payload);
      const username = String(input.username || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username) || !password) {
        return response.status(400).type('application/json').send(JSON.stringify({ error: 'Informe usuário e senha válidos.' }));
      }
      const address = request.headers['x-forwarded-for'] || 'unknown';
      const attemptKey = `${address}:${username}`;
      const attempt = this.loginAttempts.get(attemptKey);
      if (attempt && attempt.lockedUntil > Date.now()) {
        return response.status(429).type('application/json').send(JSON.stringify({ error: 'Muitas tentativas. Aguarde alguns minutos.' }));
      }
      const result = await this.pool!.query(
        `select username, name, role, active, email, company_id as "companyId", salt,
                password_hash as "passwordHash", account_type as "accountType", founder,
                profile_info as "profileInfo", portfolio, modules,
                company_access_override as "companyAccessOverride"
         from app_users where username = $1 and active = true`,
        [username],
      );
      const stored = result.rows[0] as RecordItem | undefined;
      if (!stored || !this.passwordMatches(password, stored)) {
        const next = attempt && attempt.lockedUntil <= Date.now() ? { failures: 0, lockedUntil: 0 } : (attempt || { failures: 0, lockedUntil: 0 });
        next.failures += 1;
        next.lockedUntil = next.failures >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
        this.loginAttempts.set(attemptKey, next);
        return response.status(401).type('application/json').send(JSON.stringify({ error: 'Usuário ou senha inválidos.' }));
      }
      this.loginAttempts.delete(attemptKey);
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
      const modules = this.membershipModules(stored, company, []);
      const accountType = stored.accountType || (this.isPlatformAdmin(stored) ? 'support' : (companyId === 'legacy' ? 'support' : 'member'));
      const session = {
        username: stored.username, role: stored.role || 'operador', name: stored.name || stored.username,
        email: stored.email || '', companyId, companyStatus: company?.status || (companyId === 'legacy' ? 'approved' : 'pending'),
        accessLevel: company?.accessLevel || (companyId === 'legacy' ? 'full' : 'limited'),
        licenseStatus: company?.licenseStatus || (companyId === 'legacy' ? 'approved' : 'pending'),
        modules, accountType, founder: stored.founder === true, profileInfo: stored.profileInfo || '',
        portfolio: Array.isArray(stored.portfolio) ? stored.portfolio : [], expiresAt: Date.now() + this.sessionTtlSeconds * 1000,
      };
      const merged = { ...session, ...stored, companyId, modules, accountType };
      const secure = request.headers['x-forwarded-proto'] === 'https' || request.headers.host?.startsWith('app.');
      const token = this.signedSession(session);
      response.setHeader('set-cookie', `proelium_session=${encodeURIComponent(token)}; Path=/; Max-Age=${this.sessionTtlSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, user: this.publicUser(merged) }));
    } catch (error) {
      console.error('Falha ao autenticar usuário no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Solicitação de login inválida.' }));
    }
  }

  private passwordMatches(password: string, user: RecordItem): boolean {
    try {
      const expected = Buffer.from(String(user.passwordHash || ''), 'base64');
      const salt = Buffer.from(String(user.salt || ''), 'base64');
      if (!expected.length || !salt.length) return false;
      const actual = scryptSync(password, salt, expected.length);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  }

  private passwordRecord(password: string): { salt: string; passwordHash: string } {
    const salt = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
    return { salt: salt.toString('base64'), passwordHash: scryptSync(password, salt, 64).toString('base64') };
  }

  private validCnpj(value: string): boolean {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 14 || /^([0-9])\1+$/.test(digits)) return false;
    const calc = (length: number) => {
      let sum = 0;
      let factor = 5 + (length - 12);
      for (let index = 0; index < length; index += 1) {
        sum += Number(digits[index]) * factor;
        factor -= 1;
        if (factor === 1) factor = 9;
      }
      return sum % 11 < 2 ? 0 : 11 - (sum % 11);
    };
    return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
  }

  private validCpf(value: string): boolean {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 11 || /^([0-9])\1+$/.test(digits)) return false;
    const calc = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
  }

  private payloadRecord(payload: unknown): RecordItem {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as RecordItem;
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RecordItem : {};
      } catch { return {}; }
    }
    return {};
  }

  private signedSession(payload: RecordItem): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private cookieValue(cookie: string | undefined, name: string): string {
    const value = String(cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
    try { return decodeURIComponent(value); } catch { return ''; }
  }

  private async databaseConsumeInvite(request: { headers: { cookie?: string; [key: string]: string | undefined } }, response: any) {
    const actor = await this.databaseUser(request.headers.cookie);
    if (!actor) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
    const token = this.cookieValue(request.headers.cookie, 'proelium_invite');
    if (!actor.email || !token) return response.status(401).type('application/json').send(JSON.stringify({ error: 'Nenhum convite pendente.' }));
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const inviteResult = await this.pool!.query(
      `select id, company_id as "companyId", email, role, modules, expires_at as "expiresAt", used_at as "usedAt", created_at as "createdAt"
       from company_invites where token_hash = $1 and used_at is null and expires_at > now()`,
      [tokenHash],
    );
    const invite = inviteResult.rows[0] as RecordItem | undefined;
    if (!invite) return response.status(410).type('application/json').send(JSON.stringify({ error: 'Este convite expirou ou já foi utilizado.' }));
    if (invite.email && String(invite.email).toLowerCase() !== String(actor.email).toLowerCase()) return response.status(403).type('application/json').send(JSON.stringify({ error: 'Este convite foi enviado para outro e-mail Google.' }));
    const companyResult = await this.pool!.query(
      `select id, name, document, responsible, phone, company_type as "companyType", profile_info as "profileInfo",
              founder_username as "founderUsername", status, access_level as "accessLevel", license_status as "licenseStatus",
              modules, admin_notes as "adminNotes", reviewed_at as "reviewedAt", created_at as "createdAt"
       from companies where id = $1`,
      [invite.companyId],
    );
    const company = companyResult.rows[0] as RecordItem | undefined;
    if (!company) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Empresa do convite não encontrada.' }));
    const userResult = await this.pool!.query(
      `select username, name, email, role, active, company_id as "companyId", account_type as "accountType", founder,
              profile_info as "profileInfo", portfolio, modules, company_access_override as "companyAccessOverride"
       from app_users where username = $1`,
      [actor.username],
    );
    const user = userResult.rows[0] as RecordItem | undefined;
    if (!user) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Usuário não encontrado.' }));
    if (user.companyId && user.companyId !== 'legacy' && user.companyId !== invite.companyId) return response.status(409).type('application/json').send(JSON.stringify({ error: 'Este usuário já pertence a outra empresa.' }));
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      await client.query('update app_users set company_id = $1, role = $2, active = true, updated_at = now() where username = $3', [invite.companyId, invite.role || 'operacao', actor.username]);
      await client.query('update company_invites set used_at = now() where id = $1 and used_at is null', [invite.id]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const merged: RecordItem = { ...user, companyId: invite.companyId, role: invite.role || 'operacao', active: true, modules: invite.modules || [] };
    const secure = request.headers['x-forwarded-proto'] === 'https' || request.headers.host?.startsWith('app.');
    const session = this.signedSession({ username: merged.username, role: merged.role, name: merged.name || merged.username, email: merged.email || actor.email, companyId: invite.companyId, companyStatus: company.status, accessLevel: company.accessLevel || 'limited', licenseStatus: company.licenseStatus || 'pending', modules: invite.modules || [], expiresAt: Date.now() + this.sessionTtlSeconds * 1000 });
    response.setHeader('set-cookie', [`proelium_session=${encodeURIComponent(session)}; Path=/; Max-Age=${this.sessionTtlSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`, 'proelium_invite=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    return response.status(200).type('application/json').send(JSON.stringify({ ok: true, user: this.publicUser(merged), company }));
  }

  private async databaseJoinGoogleCompany(request: { headers: { cookie?: string; [key: string]: string | undefined } }, response: any) {
    const pendingToken = this.cookieValue(request.headers.cookie, 'proelium_google_pending');
    const pending = this.verifySession(`proelium_session=${pendingToken}`);
    const token = this.cookieValue(request.headers.cookie, 'proelium_invite');
    if (!pending?.email || !token) return response.status(401).type('application/json').send(JSON.stringify({ error: 'Convite ou identificação Google expirado.' }));
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const inviteResult = await this.pool!.query(
      `select id, company_id as "companyId", email, role, modules, expires_at as "expiresAt", used_at as "usedAt", created_at as "createdAt"
       from company_invites where token_hash = $1 and used_at is null and expires_at > now()`,
      [tokenHash],
    );
    const invite = inviteResult.rows[0] as RecordItem | undefined;
    if (!invite) return response.status(410).type('application/json').send(JSON.stringify({ error: 'Este convite expirou ou já foi utilizado.' }));
    const companyResult = await this.pool!.query(
      `select id, name, document, responsible, phone, company_type as "companyType", profile_info as "profileInfo",
              founder_username as "founderUsername", status, access_level as "accessLevel", license_status as "licenseStatus",
              modules, admin_notes as "adminNotes", reviewed_at as "reviewedAt", created_at as "createdAt"
       from companies where id = $1`,
      [invite.companyId],
    );
    const company = companyResult.rows[0] as RecordItem | undefined;
    if (!company) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Empresa do convite não encontrada.' }));
    if (invite.email && String(invite.email).toLowerCase() !== String(pending.email).toLowerCase()) return response.status(403).type('application/json').send(JSON.stringify({ error: 'Este convite foi enviado para outro e-mail Google.' }));
    const existingResult = await this.pool!.query(
      `select username, name, email, role, active, company_id as "companyId", account_type as "accountType", founder,
              profile_info as "profileInfo", portfolio, modules, company_access_override as "companyAccessOverride", created_at as "createdAt"
       from app_users where lower(email) = lower($1) limit 1`,
      [pending.email],
    );
    const existing = existingResult.rows[0] as RecordItem | undefined;
    if (existing?.companyId && existing.companyId !== invite.companyId) return response.status(409).type('application/json').send(JSON.stringify({ error: 'Este e-mail já pertence a outra empresa.' }));
    const base = (String(pending.email).split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'colaborador').slice(0, 24);
    const usernameResult = existing ? null : await this.pool!.query('select username from app_users where username = $1', [base]);
    const username = existing?.username || (usernameResult?.rowCount ? `${base}-${Date.now().toString().slice(-5)}` : base);
    const name = existing?.name || String(pending.name || username).slice(0, 80);
    const email = String(pending.email).toLowerCase();
    const role = invite.role || 'operacao';
    const createdAt = existing?.createdAt || new Date().toISOString();
    const credentials = this.passwordRecord(randomUUID());
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      if (existing) {
        await client.query(
          `update app_users set name = $1, email = $2, role = $3, active = true, company_id = $4, account_type = 'member', founder = false, salt = $5, password_hash = $6, updated_at = now()
           where username = $7`,
          [name, email, role, invite.companyId, credentials.salt, credentials.passwordHash, existing.username],
        );
      } else {
        await client.query(
          `insert into app_users (username, name, email, role, active, company_id, account_type, founder, profile_info, portfolio, modules, salt, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, true, $5, 'member', false, '', '[]'::jsonb, $6::jsonb, $7, $8, $9, $9)`,
          [username, name, email, role, invite.companyId, JSON.stringify(invite.modules || []), credentials.salt, credentials.passwordHash, createdAt],
        );
      }
      const consumed = await client.query('update company_invites set used_at = now() where id = $1 and used_at is null returning id', [invite.id]);
      if (!consumed.rowCount) throw new Error('Convite já utilizado.');
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const user = { ...(existing || {}), username, name, email, role, active: true, companyId: invite.companyId, accountType: 'member', founder: false, createdAt, modules: existing?.modules || invite.modules || [] };
    const modules = this.membershipModules(user, company, invite.modules || []);
    const secure = request.headers['x-forwarded-proto'] === 'https' || request.headers.host?.startsWith('app.');
    const session = this.signedSession({ username, role, name, email, companyId: invite.companyId, companyStatus: company.status, accessLevel: company.accessLevel || 'limited', licenseStatus: company.licenseStatus || 'pending', modules, accountType: 'member', founder: false, expiresAt: Date.now() + this.sessionTtlSeconds * 1000 });
    response.setHeader('set-cookie', [`proelium_session=${encodeURIComponent(session)}; Path=/; Max-Age=${this.sessionTtlSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`, 'proelium_invite=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    return response.status(201).type('application/json').send(JSON.stringify({ ok: true, user: this.publicUser({ ...user, modules }), company }));
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
  async consumeInvite(@Req() request: { headers: { cookie?: string; [key: string]: string | undefined } }, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseConsumeInvite(request, response); }
      catch (error) {
        console.error('Falha ao vincular convite no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível vincular o convite.' }));
      }
    }
    const upstream = await this.forward('/api/auth/consume-invite', 'POST', request);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('register-company')
  async registerCompany(@Req() request: { headers: { cookie?: string; [key: string]: string | undefined } }, @Body() payload: unknown, @Res() response: any) {
    if (this.pool) {
      try {
        const input = this.payloadRecord(payload);
        const companyName = String(input.companyName || '').trim().slice(0, 120);
        const document = String(input.document || '').trim().slice(0, 32);
        const username = String(input.username || '').trim().toLowerCase();
        const name = String(input.name || '').trim().slice(0, 80);
        const password = String(input.password || '');
        if (!companyName || !name || !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username) || password.length < 10) {
          return response.status(400).type('application/json').send(JSON.stringify({ error: 'Informe empresa, nome, usuário válido e senha com pelo menos 10 caracteres.' }));
        }
        const existing = await this.pool.query('select username from app_users where username = $1', [username]);
        if (existing.rowCount) return response.status(409).type('application/json').send(JSON.stringify({ error: 'Esse usuário já está cadastrado.' }));
        const companyId = `emp-${randomUUID()}`;
        const createdAt = new Date().toISOString();
        const credentials = this.passwordRecord(password);
        const client = await this.pool.connect();
        try {
          await client.query('begin');
          await client.query(
            `insert into companies (id, name, document, founder_username, created_at)
             values ($1, $2, $3, $4, $5)`,
            [companyId, companyName, document, username, createdAt],
          );
          await client.query(
            `insert into app_users (username, name, role, active, salt, password_hash, company_id, account_type, founder, profile_info, portfolio, modules, created_at, updated_at)
             values ($1, $2, 'admin', true, $3, $4, $5, 'founder', true, '', '[]'::jsonb, '[]'::jsonb, $6, $6)`,
            [username, name, credentials.salt, credentials.passwordHash, companyId, createdAt],
          );
          await client.query('commit');
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
        const company = { id: companyId, name: companyName, document, founderUsername: username, createdAt };
        const user = { username, name, role: 'admin', active: true, companyId, accountType: 'founder', founder: true, profileInfo: '', portfolio: [], modules: [] };
        const secure = request.headers['x-forwarded-proto'] === 'https' || request.headers.host?.startsWith('app.');
        const token = this.signedSession({ username, role: 'admin', name, companyId, expiresAt: Date.now() + this.sessionTtlSeconds * 1000 });
        response.setHeader('set-cookie', `proelium_session=${encodeURIComponent(token)}; Path=/; Max-Age=${this.sessionTtlSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
        return response.status(201).type('application/json').send(JSON.stringify({ ok: true, user: this.publicUser(user), company }));
      } catch (error) {
        console.error('Falha ao cadastrar empresa no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível concluir o cadastro.' }));
      }
    }
    const upstream = await this.forward('/api/auth/register-company', 'POST', request, payload);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('register-google-company')
  async registerGoogleCompany(@Req() request: { headers: { cookie?: string; [key: string]: string | undefined } }, @Body() payload: unknown, @Res() response: any) {
    if (this.pool) {
      try {
        const pendingToken = this.cookieValue(request.headers.cookie, 'proelium_google_pending');
        const pending = this.verifySession(`proelium_session=${pendingToken}`);
        if (!pending?.email) return response.status(401).type('application/json').send(JSON.stringify({ error: 'A identificação Google expirou. Tente novamente.' }));
        const input = this.payloadRecord(payload);
        const companyName = String(input.companyName || '').trim().slice(0, 120);
        const document = String(input.document || '').trim().slice(0, 32);
        const responsible = String(input.responsible || pending.name || '').trim().slice(0, 80);
        const phone = String(input.phone || '').trim().slice(0, 30);
        const companyType = ['residencial', 'contratante', 'contratado'].includes(input.companyType) ? input.companyType : 'contratado';
        const profileInfo = String(input.profileInfo || '').trim().slice(0, 2000);
        const documentValid = companyType === 'contratante' ? this.validCnpj(document) : this.validCnpj(document) || this.validCpf(document);
        if (!companyName || !documentValid || !responsible || phone.replace(/\D/g, '').length < 10) {
          return response.status(400).type('application/json').send(JSON.stringify({ error: 'Informe um CPF ou CNPJ válido, nome da empresa, responsável e telefone válido.' }));
        }
        const documentDigits = document.replace(/\D/g, '');
        const duplicateCompany = await this.pool.query("select id from companies where regexp_replace(document, '[^0-9]', '', 'g') = $1", [documentDigits]);
        if (duplicateCompany.rowCount) return response.status(409).type('application/json').send(JSON.stringify({ error: 'Este CNPJ já possui cadastro no Proelium.' }));
        const base = (String(pending.email).split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'usuario').slice(0, 24);
        const existingUsername = await this.pool.query('select username from app_users where username = $1', [base]);
        const username = existingUsername.rowCount ? `${base}-${Date.now().toString().slice(-5)}` : base;
        const companyId = `emp-${randomUUID()}`;
        const createdAt = new Date().toISOString();
        const company = { id: companyId, name: companyName, document, responsible, phone, companyType, profileInfo, status: 'approved', accessLevel: 'limited', licenseStatus: 'pending', founderUsername: username, modules: [], createdAt };
        const user = { username, name: responsible, email: String(pending.email).toLowerCase(), role: 'admin', active: true, companyId, accountType: 'founder', founder: true, profileInfo: '', portfolio: [], modules: [] };
        const credentials = this.passwordRecord(randomUUID());
        const client = await this.pool.connect();
        try {
          await client.query('begin');
          await client.query(
            `insert into companies (id, name, document, responsible, phone, status, access_level, license_status, company_type, profile_info, founder_username, modules, created_at)
             values ($1, $2, $3, $4, $5, 'approved', 'limited', 'pending', $6, $7, $8, '[]'::jsonb, $9)`,
            [companyId, companyName, document, responsible, phone, companyType, profileInfo, username, createdAt],
          );
          await client.query(
            `insert into app_users (username, name, email, role, active, company_id, account_type, founder, profile_info, portfolio, modules, salt, password_hash, created_at, updated_at)
             values ($1, $2, $3, 'admin', true, $4, 'founder', true, '', '[]'::jsonb, '[]'::jsonb, $5, $6, $7, $7)`,
            [username, responsible, user.email, companyId, credentials.salt, credentials.passwordHash, createdAt],
          );
          await client.query('commit');
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
        const modules = this.membershipModules(user, company, []);
        const secure = request.headers['x-forwarded-proto'] === 'https' || request.headers.host?.startsWith('app.');
        const token = this.signedSession({ username, role: 'admin', name: responsible, email: user.email, companyId, companyStatus: 'approved', accessLevel: 'limited', licenseStatus: 'pending', modules, accountType: 'founder', founder: true, portfolio: [], expiresAt: Date.now() + this.sessionTtlSeconds * 1000 });
        response.setHeader('set-cookie', `proelium_session=${encodeURIComponent(token)}; Path=/; Max-Age=${this.sessionTtlSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
        return response.status(201).type('application/json').send(JSON.stringify({ ok: true, user: this.publicUser({ ...user, modules }), company }));
      } catch (error) {
        console.error('Falha ao cadastrar empresa Google no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível concluir o cadastro da empresa.' }));
      }
    }
    const upstream = await this.forward('/api/auth/register-google-company', 'POST', request, payload);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }

  @Post('join-google-company')
  async joinGoogleCompany(@Req() request: { headers: { cookie?: string; [key: string]: string | undefined } }, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseJoinGoogleCompany(request, response); }
      catch (error) {
        console.error('Falha ao aceitar convite Google no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível aceitar o convite.' }));
      }
    }
    const upstream = await this.forward('/api/auth/join-google-company', 'POST', request);
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.setHeader('set-cookie', setCookie);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
