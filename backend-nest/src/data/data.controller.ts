import { Body, Controller, Get, Put, Req, Res } from '@nestjs/common';
import { Pool } from 'pg';

type RecordItem = Record<string, any>;

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

  @Get()
  async read(@Req() request: { headers: { cookie?: string } }, @Res() response: any) {
    if (!this.pool) {
      const upstream = await this.legacy('/api/data', request);
      return response.status(upstream.status).type('application/json').send(await upstream.text());
    }
    try {
      const user = await this.authenticatedUser(request.headers.cookie);
      if (!user) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      const result = await this.pool.query('select data, updated_at as "updatedAt", revision from app_state where state_key = $1', [this.stateKey(user.companyId || 'legacy')]);
      const current = result.rows[0] as RecordItem | undefined;
      const data = current?.data && typeof current.data === 'object' ? current.data : null;
      return response.status(200).type('application/json').send(JSON.stringify({ data: this.visibleDataForUser(data, user), updatedAt: current?.updatedAt || null, revision: Number(current?.revision || 0) }));
    } catch (error) {
      console.error('Falha ao ler dados compartilhados no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(500).type('application/json').send(JSON.stringify({ error: 'Não foi possível ler os dados compartilhados.' }));
    }
  }

  @Put()
  async write(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    const upstream = await this.legacy('/api/data', request, 'PUT', payload);
    response.status(upstream.status).type('application/json').send(await upstream.text());
  }
}
