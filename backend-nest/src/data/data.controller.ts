import { Body, Controller, Get, Put, Req, Res } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, any>;
type WorkflowResult = { ok: boolean; message?: string };
type CommercialWorkflow = {
  applyValidatedSurveyTransition: (current: RecordItem, next: RecordItem, actor: string, validatedAt: string) => RecordItem;
  validate: (current: RecordItem, next: RecordItem) => WorkflowResult;
};

const commercialWorkflow = require('../../../commercial-workflow.js') as CommercialWorkflow;

const rolePermissions: Record<string, string[]> = {
  admin: ['*'], suporte: [],
  comercial: ['dashboard', 'clients', 'commercial', 'quotes', 'products', 'survey'],
  operacao: ['dashboard', 'projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'reports', 'execution', 'diagram', 'quality', 'collaborators', 'equipment', 'knowledge'],
  financeiro: ['dashboard', 'clients', 'projects', 'commercial', 'finance', 'bi', 'biMarket', 'knowledge'],
  leitura: ['dashboard', 'projects', 'installations', 'knowledge', 'bi', 'biMarket'],
};

const dataAccessScopes: Record<string, string[]> = {
  clients: ['clients', 'activities'], projects: ['projects', 'projectChecklists', 'projectDeliveries', 'supportTickets', 'technicalConnections', 'technicalConnectionEdits', 'technicalConnectionOverrides', 'schedulePhases'],
  processes: ['processes'], tasks: ['tasks'], agenda: ['appointments'], commercial: ['opportunities'],
  quotes: ['quotes', 'quoteRooms', 'packages', 'procurementRequests'], products: ['products', 'manufacturerLibrary'],
  survey: ['surveys', 'surveyPoints', 'surveyRooms'], installations: ['installations'], operations: ['serviceOrders'],
  reports: ['serviceReports'], quality: ['evaluations'], collaborators: ['collaborators'],
  equipment: ['equipment', 'equipmentHistory'], finance: ['financialEntries', 'financialAccounts'],
  knowledge: ['articles'], audit: ['auditLog', 'recoveryLog'], diagram: ['technicalPoints', 'technicalConnections', 'technicalConnectionEdits', 'technicalConnectionOverrides'],
  purchases: ['purchaseItems'], execution: ['executionEntries', 'executionItems'],
};
dataAccessScopes.commercial.push('appointments');

const writableRoles: Record<string, Set<string> | null> = {
  admin: null,
  comercial: new Set(['clients', 'commercial', 'quotes', 'products', 'survey']),
  operacao: new Set(['projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'reports', 'execution', 'diagram', 'quality', 'collaborators', 'equipment', 'knowledge']),
  financeiro: new Set(['finance']),
  leitura: new Set(),
};

const dataDomains: Record<string, string> = {
  clients: 'clients', projects: 'projects', processes: 'processes', tasks: 'tasks', agenda: 'appointments', commercial: 'opportunities', quotes: 'quotes', products: 'products', survey: 'surveys', installations: 'installations', operations: 'serviceOrders', reports: 'serviceReports', execution: 'executionEntries', diagram: 'technicalConnections', quality: 'evaluations', collaborators: 'collaborators', equipment: 'equipment', knowledge: 'articles', finance: 'financialEntries', purchases: 'purchaseItems',
};

@Controller('data')
export class DataController {
  private readonly pool?: Pool;
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);

  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
  }

  private async legacy(path: string, request: { headers: { cookie?: string } }, method = 'GET', payload?: unknown) {
    return fetch(`${this.legacyOrigin}${path}`, {
      method,
      headers: { ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload ?? {}) }),
    });
  }

  private async authenticatedUser(cookie?: string): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => ({})) as RecordItem;
    return body.authenticated && body.user ? body.user : null;
  }

  private stateKey(companyId: string): string {
    return !companyId || companyId === 'legacy' ? 'shared' : `company:${String(companyId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}`;
  }

  private permissionsFor(role: string): string[] {
    return rolePermissions[role === 'operador' ? 'operacao' : role] || rolePermissions.operacao;
  }

  private dataViewsForUser(user: RecordItem): Set<string> {
    if (user.platformAdmin || user.supportUser || user.portfolioUser) return new Set();
    if (user.companyId && user.companyId !== 'legacy' && user.companyAccessOverride === 'full') return new Set(['*']);
    const roleViews = this.permissionsFor(user.role);
    const modules = Array.isArray(user.modules) ? user.modules : [];
    return new Set(user.accessLevel === 'limited'
      ? (modules.length ? modules : ['dashboard', 'knowledge'])
      : (modules.length ? (roleViews[0] === '*' ? modules : roleViews.filter((view) => modules.includes(view))) : roleViews));
  }

  private visibleDataForUser(data: RecordItem | null, user: RecordItem): RecordItem {
    const allowed = this.dataViewsForUser(user);
    const full = allowed.has('*');
    const scopedKeys = new Set(Object.values(dataAccessScopes).flat());
    return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => {
      if (!Array.isArray(value)) return [key, value];
      const scope = Object.entries(dataAccessScopes).find(([, keys]) => keys.includes(key))?.[0];
      return [key, scopedKeys.has(key) && !full && !allowed.has(scope || '') ? [] : value];
    }));
  }

  private record(value: unknown): RecordItem {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : {};
  }

  private sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private isCompanyAdmin(user: RecordItem): boolean {
    return user.role === 'admin' && Boolean(user.companyId && user.companyId !== 'legacy');
  }

  private isFounder(user: RecordItem): boolean {
    return user.accountType === 'founder' || user.founder === true;
  }

  private mergeWritableData(current: RecordItem, incoming: RecordItem, user: RecordItem, resource: string): RecordItem {
    const allowed = this.dataViewsForUser(user);
    const full = allowed.has('*');
    const merged: RecordItem = { ...current, ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => !Array.isArray(value))) };
    for (const [scope, keys] of Object.entries(dataAccessScopes)) {
      if (!full && !allowed.has(scope)) continue;
      for (const key of keys) {
        if (key === 'schedulePhases' && !(this.isCompanyAdmin(user) || this.isFounder(user))) continue;
        if (Object.prototype.hasOwnProperty.call(incoming, key)) merged[key] = incoming[key];
      }
    }
    if (!full && resource === 'execution' && allowed.has('execution') && Object.prototype.hasOwnProperty.call(incoming, 'financialEntries')) merged.financialEntries = incoming.financialEntries;
    return merged;
  }

  private async state(clientOrPool: Pool | PoolClient, companyId: string, lock = false): Promise<{ data: RecordItem; updatedAt: string | null; revision: number }> {
    const result = await clientOrPool.query(`select data, updated_at as "updatedAt", revision from app_state where state_key = $1${lock ? ' for update' : ''}`, [this.stateKey(companyId)]);
    const row = result.rows[0] as RecordItem | undefined;
    return { data: row?.data && typeof row.data === 'object' ? row.data : {}, updatedAt: row?.updatedAt || null, revision: Number(row?.revision || 0) };
  }

  @Get()
  async read(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (!this.pool) {
      const upstream = await this.legacy('/api/data', request);
      return response.status(upstream.status).type('application/json').send(await upstream.text());
    }
    try {
      const user = await this.authenticatedUser(request.headers.cookie);
      if (!user) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      const current = await this.state(this.pool, user.companyId || 'legacy');
      return response.status(200).type('application/json').send(JSON.stringify({ data: this.visibleDataForUser(current.data, user), updatedAt: current.updatedAt, revision: current.revision }));
    } catch (error) {
      console.error('Falha ao ler dados compartilhados no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(500).type('application/json').send(JSON.stringify({ error: 'Não foi possível ler os dados compartilhados.' }));
    }
  }

  @Put()
  async write(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (!this.pool) {
      const upstream = await this.legacy('/api/data', request, 'PUT', payload);
      return response.status(upstream.status).type('application/json').send(await upstream.text());
    }
    try {
      const user = await this.authenticatedUser(request.headers.cookie);
      if (!user) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      const input = this.record(payload);
      const incoming = input.data;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return response.status(400).type('application/json').send(JSON.stringify({ error: 'Dados inválidos.' }));
      const current = await this.state(this.pool, user.companyId || 'legacy');
      const resource = String(input.resource || '');
      const dataViews = this.dataViewsForUser(user);
      const fullDataAccess = dataViews.has('*');
      const changedScopes = Object.entries(dataAccessScopes)
        .filter(([, keys]) => keys.some((key) => Object.prototype.hasOwnProperty.call(incoming, key) && !this.sameValue(current.data[key], incoming[key])))
        .map(([view]) => view);
      const deniedScopes = changedScopes.filter((view) => !fullDataAccess && !dataViews.has(view)
        && !(resource === 'execution' && view === 'finance' && dataViews.has('execution'))
        && !(resource === 'diagram' && view === 'diagram' && dataViews.has('projects')));
      if (deniedScopes.length) return response.status(403).type('application/json').send(JSON.stringify({ error: `Seu perfil não pode acessar: ${deniedScopes.join(', ')}.` }));
      const role = user.role === 'operador' ? 'operacao' : user.role;
      const roleAllowed = writableRoles[role];
      const allowed = roleAllowed && Array.isArray(user.modules) && user.modules.length
        ? new Set([...roleAllowed].filter((view) => user.modules.includes(view)))
        : roleAllowed;
      if (allowed) {
        const changedDomains = Object.keys(dataDomains).filter((view) => {
          const key = dataDomains[view];
          return Object.prototype.hasOwnProperty.call(incoming, key) && !this.sameValue(current.data[key], incoming[key]);
        });
        const denied = changedDomains.filter((view) => !allowed.has(view)
          && !(resource === 'execution' && view === 'finance' && allowed.has('execution'))
          && !(resource === 'diagram' && view === 'diagram' && allowed.has('projects')));
        if (denied.length) return response.status(403).type('application/json').send(JSON.stringify({ error: `Seu perfil não pode alterar: ${denied.join(', ')}.` }));
      }
      const baseRevision = Number(input.baseRevision || 0);
      let nextData = this.mergeWritableData(current.data, incoming, user, resource);
      nextData = commercialWorkflow.applyValidatedSurveyTransition(current.data, nextData, user.name || user.username, new Date().toISOString());
      const workflow = commercialWorkflow.validate(current.data, nextData);
      if (!workflow.ok) return response.status(422).type('application/json').send(JSON.stringify({ error: workflow.message }));
      const stateKey = this.stateKey(user.companyId || 'legacy');
      const client = await this.pool.connect();
      let saved: { updatedAt: string; revision: number };
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:app_state:${stateKey}`]);
        const locked = await this.state(client, user.companyId || 'legacy', true);
        if (locked.revision !== baseRevision) {
          await client.query('rollback');
          return response.status(409).type('application/json').send(JSON.stringify({ error: 'Os dados foram atualizados por outro aparelho.', revision: locked.revision, updatedAt: locked.updatedAt }));
        }
        saved = { updatedAt: new Date().toISOString(), revision: locked.revision + 1 };
        await client.query(
          `insert into app_state (state_key, data, revision, updated_at) values ($1, $2::jsonb, $3, $4)
           on conflict (state_key) do update set data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at`,
          [stateKey, JSON.stringify(nextData), saved.revision, saved.updatedAt],
        );
        await client.query(
          `insert into app_state_revisions (state_key, revision, data, updated_at, actor) values ($1, $2, $3::jsonb, $4, $5)`,
          [stateKey, saved.revision, JSON.stringify(nextData), saved.updatedAt, user.username],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return response.status(200).type('application/json').send(JSON.stringify({ ok: true, updatedAt: saved.updatedAt, revision: saved.revision }));
    } catch (error) {
      console.error('Falha ao salvar dados compartilhados no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível salvar os dados.' }));
    }
  }
}
