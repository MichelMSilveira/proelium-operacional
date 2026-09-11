import { Body, Controller, Delete, Get, Put, Req, Res } from '@nestjs/common';
import { Pool } from 'pg';

type RecordItem = Record<string, any>;

@Controller('admin/companies')
export class AdminCompaniesController {
  private readonly pool?: Pool;
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : 'http://localhost:4173');

  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
  }

  private async actor(request: { headers: { cookie?: string } }): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: request.headers.cookie ? { cookie: request.headers.cookie } : {} }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => null) as RecordItem | null;
    return body?.authenticated && body.user ? body.user as RecordItem : null;
  }

  private isPlatformAdmin(user: RecordItem): boolean {
    const admins = String(process.env.PROELIUM_PLATFORM_ADMINS || 'admin').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    return admins.includes(String(user.username || '').toLowerCase()) || admins.includes(String(user.email || '').toLowerCase());
  }

  private isPlatformStaff(user: RecordItem): boolean {
    return this.isPlatformAdmin(user) || (!user.companyId || user.companyId === 'legacy') && !user.portfolioUser && (user.role === 'suporte' || user.role === 'admin');
  }

  private async authorize(request: { headers: { cookie?: string } }, response: any, mutation = false): Promise<RecordItem | null> {
    const actor = await this.actor(request);
    if (!actor) {
      response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      return null;
    }
    if (mutation ? (actor.role !== 'admin' || !this.isPlatformAdmin(actor)) : !this.isPlatformStaff(actor)) {
      response.status(403).type('application/json').send(JSON.stringify({ error: mutation ? 'Apenas administradores da plataforma podem alterar empresas.' : 'Apenas a equipe da plataforma pode consultar empresas.' }));
      return null;
    }
    return actor;
  }

  private async listCompanies(): Promise<RecordItem[]> {
    const companies = await this.pool!.query(
      `select id, name, document, responsible, phone, company_type as "companyType", profile_info as "profileInfo",
              founder_username as "founderUsername", status, access_level as "accessLevel", license_status as "licenseStatus",
              modules, admin_notes as "adminNotes", reviewed_at as "reviewedAt", created_at as "createdAt"
       from companies order by name`,
    );
    const admins = await this.pool!.query('select username, name, email, company_id as "companyId" from app_users where role = $1 and active = true', ['admin']);
    const adminByCompany = new Map<string, RecordItem>();
    for (const admin of admins.rows) if (!adminByCompany.has(String(admin.companyId))) adminByCompany.set(String(admin.companyId), admin);
    return companies.rows.map((company) => {
      const admin = adminByCompany.get(String(company.id));
      return {
        ...company,
        modules: company.modules || [],
        adminName: admin?.name || company.responsible || '',
        adminEmail: admin?.email || '',
        adminUsername: admin?.username || '',
      };
    });
  }

  @Get()
  async list(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (!this.pool) return response.status(503).type('application/json').send(JSON.stringify({ error: 'Armazenamento PostgreSQL indisponível.' }));
    const actor = await this.authorize(request, response);
    if (!actor) return;
    try { return response.status(200).type('application/json').send(JSON.stringify({ companies: await this.listCompanies() })); }
    catch (error) {
      console.error('Falha ao listar empresas no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível consultar as empresas agora.' }));
    }
  }

  @Put()
  async update(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (!this.pool) return response.status(503).type('application/json').send(JSON.stringify({ error: 'Armazenamento PostgreSQL indisponível.' }));
    const actor = await this.authorize(request, response, true);
    if (!actor) return;
    try {
      const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
      const id = String(input.id || ''), status = String(input.status || '');
      if (!id || !['pending', 'approved', 'rejected', 'suspended'].includes(status)) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Atualização inválida.' }));
      const current = await this.pool.query('select modules, access_level as "accessLevel", license_status as "licenseStatus", admin_notes as "adminNotes" from companies where id = $1', [id]);
      const company = current.rows[0] as RecordItem | undefined;
      if (!company) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Empresa não encontrada.' }));
      const allowedModules = ['dashboard', 'clients', 'projects', 'commercial', 'quotes', 'products', 'survey', 'routines', 'reports', 'finance', 'knowledge'];
      const modules = Array.isArray(input.modules) ? [...new Set(input.modules.filter((item: unknown) => allowedModules.includes(String(item))))].slice(0, 20) : (company.modules || ['dashboard', 'knowledge']);
      const accessLevel = ['limited', 'full'].includes(input.accessLevel) ? input.accessLevel : (company.accessLevel || 'limited');
      const licenseStatus = ['pending', 'approved', 'rejected'].includes(input.licenseStatus) ? input.licenseStatus : (company.licenseStatus || 'pending');
      const adminNotes = String(input.adminNotes || company.adminNotes || '').slice(0, 1000);
      await this.pool.query('update companies set status = $1, access_level = $2, modules = $3::jsonb, license_status = $4, admin_notes = $5, reviewed_at = now() where id = $6', [status, accessLevel, JSON.stringify(modules), licenseStatus, adminNotes, id]);
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, companies: await this.listCompanies() }));
    } catch (error) {
      console.error('Falha ao atualizar empresa no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível atualizar o cadastro.' }));
    }
  }

  @Delete()
  async remove(@Req() request: { headers: { cookie?: string; host?: string }; url?: string }, @Res() response: any) {
    if (!this.pool) return response.status(503).type('application/json').send(JSON.stringify({ error: 'Armazenamento PostgreSQL indisponível.' }));
    const actor = await this.authorize(request, response, true);
    if (!actor) return;
    const id = String(new URL(request.url || '/api/admin/companies', `http://${request.headers.host || 'internal'}`).searchParams.get('id') || '');
    if (!id) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Empresa inválida.' }));
    if (actor.companyId === id) return response.status(400).type('application/json').send(JSON.stringify({ error: 'O administrador atual não pode excluir a própria empresa.' }));
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query('select id, name from companies where id = $1', [id]);
      const company = result.rows[0] as RecordItem | undefined;
      if (!company) { await client.query('rollback'); return response.status(404).type('application/json').send(JSON.stringify({ error: 'Empresa não encontrada.' })); }
      const users = await client.query('select username, role, account_type as "accountType", founder, portfolio, created_at as "createdAt" from app_users where company_id = $1', [id]);
      for (const user of users.rows) {
        const portfolio = [...(Array.isArray(user.portfolio) ? user.portfolio : []), { companyId: id, companyName: company.name || 'Empresa', role: user.role || 'operador', founder: user.accountType === 'founder' || user.founder === true, joinedAt: user.createdAt || null, leftAt: new Date().toISOString() }];
        await client.query('update app_users set company_id = null, account_type = $1, founder = false, company_access_override = null, modules = $2::jsonb, portfolio = $3::jsonb, updated_at = now() where username = $4', ['portfolio', '[]', JSON.stringify(portfolio), user.username]);
      }
      const stateKey = `company:${String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}`;
      await client.query('delete from app_state_revisions where state_key = $1', [stateKey]);
      await client.query('delete from app_state where state_key = $1', [stateKey]);
      await client.query('delete from companies where id = $1', [id]);
      await client.query('commit');
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, companies: await this.listCompanies() }));
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      console.error('Falha ao excluir empresa no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(500).type('application/json').send(JSON.stringify({ error: 'Não foi possível excluir a empresa com segurança.' }));
    } finally {
      client.release();
    }
  }

}
