import { Body, Controller, Delete, Get, Post, Put, Req, Res } from '@nestjs/common';
import { Pool } from 'pg';

type RecordItem = Record<string, any>;

@Controller('company')
export class CompanyController {
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

  private async authorize(request: { headers: { cookie?: string } }, response: any): Promise<RecordItem | null> {
    const actor = await this.actor(request);
    if (!actor) {
      response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      return null;
    }
    if (actor.role !== 'admin' || !actor.companyId || actor.companyId === 'legacy') {
      response.status(403).type('application/json').send(JSON.stringify({ error: 'Apenas o administrador da empresa pode editar sua configuração.' }));
      return null;
    }
    return actor;
  }

  private publicCompany(company: RecordItem): RecordItem {
    return {
      id: company.id, name: company.name || '', document: company.document || '', responsible: company.responsible || '',
      phone: company.phone || '', companyType: company.companyType || '', profileInfo: company.profileInfo || '',
      founderUsername: company.founderUsername || '', status: company.status || 'pending', accessLevel: company.accessLevel || 'limited',
      licenseStatus: company.licenseStatus || 'pending', createdAt: company.createdAt || null,
    };
  }

  private async databaseProfile(request: { headers: { cookie?: string } }, response: any, payload?: unknown) {
    const actor = await this.authorize(request, response);
    if (!actor) return;
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
    const companyResult = await this.pool!.query(
      `select id, name, document, responsible, phone, company_type as "companyType", profile_info as "profileInfo",
              founder_username as "founderUsername", status, access_level as "accessLevel",
              license_status as "licenseStatus", created_at as "createdAt"
       from companies where id = $1`,
      [actor.companyId],
    );
    const company = companyResult.rows[0] as RecordItem | undefined;
    if (!company) return response.status(404).type('application/json').send(JSON.stringify({ error: 'Empresa não encontrada.' }));
    if (payload === undefined) return response.status(200).type('application/json').send(JSON.stringify({ company: this.publicCompany(company) }));

    const name = String(input.name || '').trim().slice(0, 120);
    const responsible = String(input.responsible || '').trim().slice(0, 80);
    const phone = String(input.phone || '').trim().slice(0, 30);
    const profileInfo = String(input.profileInfo || '').trim().slice(0, 2000);
    if (!name || !responsible || phone.replace(/\D/g, '').length < 10) {
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Informe nome da empresa, responsável e telefone válido.' }));
    }
    const saved = await this.pool!.query(
      `update companies set name = $1, responsible = $2, phone = $3, profile_info = $4 where id = $5
       returning id, name, document, responsible, phone, company_type as "companyType", profile_info as "profileInfo",
                 founder_username as "founderUsername", status, access_level as "accessLevel",
                 license_status as "licenseStatus", created_at as "createdAt"`,
      [name, responsible, phone, profileInfo, actor.companyId],
    );
    return response.status(200).type('application/json').send(JSON.stringify({ ok: true, company: this.publicCompany(saved.rows[0]) }));
  }

  private async databaseRoutines(request: { headers: { cookie?: string } }, response: any, payload?: unknown, write = false) {
    const actor = await this.actor(request);
    if (!actor) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
    const companyId = String(actor.companyId || 'legacy');
    if (companyId === 'legacy') return response.status(403).type('application/json').send(JSON.stringify({ error: 'É necessário estar vinculado a uma empresa.' }));
    if (!write) {
      const result = await this.pool!.query(
        `select id, name, description, periodicity, steps, created_at as "createdAt", updated_at as "updatedAt"
         from routines where company_id = $1 order by created_at desc`,
        [companyId],
      );
      return response.status(200).type('application/json').send(JSON.stringify({ routines: result.rows.map((row) => ({ ...row, steps: row.steps || [] })) }));
    }
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
    if (!Array.isArray(input.routines)) return response.status(200).type('application/json').send(JSON.stringify({ ok: true, routines: [] }));
    const routines = input.routines.slice(0, 200).map((item: unknown) => {
      const value = item && typeof item === 'object' && !Array.isArray(item) ? item as RecordItem : {};
      return {
        id: String(value.id || crypto.randomUUID()).slice(0, 80),
        name: String(value.name || '').trim().slice(0, 120),
        description: String(value.description || '').trim().slice(0, 500),
        periodicity: String(value.periodicity || 'Sem periodicidade').slice(0, 40),
        steps: Array.isArray(value.steps) ? value.steps.slice(0, 100).map((step: unknown) => String(step).trim().slice(0, 200)).filter(Boolean) : [],
      };
    }).filter((item) => item.name);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:routines:${companyId}`]);
      await client.query('delete from routines where company_id = $1', [companyId]);
      for (const routine of routines) {
        await client.query(
          `insert into routines (id, company_id, name, description, periodicity, steps)
           values ($1, $2, $3, $4, $5, $6::jsonb)`,
          [routine.id, companyId, routine.name, routine.description, routine.periodicity, JSON.stringify(routine.steps)],
        );
      }
      await client.query('select revision from routines_domain_state where company_id = $1 for update', [companyId]);
      const revisionRow = await client.query(
        `insert into routines_domain_state (company_id, revision) values ($1, 1)
         on conflict (company_id) do update set revision = routines_domain_state.revision + 1, updated_at = now()
         returning revision`,
        [companyId],
      );
      await client.query('commit');
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, routines, revision: Number(revisionRow.rows[0]?.revision || 0) }));
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  @Get('profile')
  async profile(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseProfile(request, response); }
      catch (error) {
        console.error('Falha ao consultar perfil da empresa no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível consultar a configuração da empresa agora.' }));
      }
    }
    const upstream = await this.forward('/api/company/profile', 'GET', request);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Put('profile')
  async updateProfile(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseProfile(request, response, payload); }
      catch (error) {
        console.error('Falha ao atualizar perfil da empresa no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível atualizar a configuração da empresa agora.' }));
      }
    }
    const upstream = await this.forward('/api/company/profile', 'PUT', request, payload);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Get('routines')
  async routines(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseRoutines(request, response); }
      catch (error) {
        console.error('Falha ao consultar rotinas da empresa no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível consultar as rotinas agora.' }));
      }
    }
    const upstream = await this.forward('/api/company/routines', 'GET', request);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Put('routines')
  async updateRoutines(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (this.pool) {
      try { return await this.databaseRoutines(request, response, payload, true); }
      catch (error) {
        console.error('Falha ao atualizar rotinas da empresa no PostgreSQL:', error instanceof Error ? error.message : error);
        return response.status(503).type('application/json').send(JSON.stringify({ error: 'Não foi possível atualizar as rotinas agora.' }));
      }
    }
    const upstream = await this.forward('/api/company/routines', 'PUT', request, payload);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Get('invites')
  async invites(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    const upstream = await this.forward('/api/company/invites', 'GET', request);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Post('invites')
  async createInvite(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/company/invites', 'POST', request, payload);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }

  @Delete('invites')
  async deleteInvite(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.forward('/api/company/invites', 'DELETE', request, payload);
    const body = await upstream.text();
    response.status(upstream.status).type('application/json').send(body);
  }
}
