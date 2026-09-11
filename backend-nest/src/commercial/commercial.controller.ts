import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, any>;
type CommercialWorkflow = {
  reconcileLegacyStages: (data: RecordItem) => { data: RecordItem; changes: RecordItem[] };
};

const commercialWorkflow = require('../../../commercial-workflow.js') as CommercialWorkflow;

@Controller('commercial')
export class CommercialController {
  private readonly pool?: Pool;
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4174}`;

  constructor() {
    if (process.env.DATABASE_URL) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
  }

  private stateKey(companyId: string): string {
    return !companyId || companyId === 'legacy' ? 'shared' : `company:${String(companyId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}`;
  }

  private async authenticatedUser(cookie?: string): Promise<RecordItem | null> {
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!upstream || upstream.status !== 200) return null;
    const body = await upstream.json().catch(() => ({})) as RecordItem;
    return body.authenticated && body.user ? body.user : null;
  }

  private async state(clientOrPool: Pool | PoolClient, companyId: string, lock = false): Promise<{ data: RecordItem; updatedAt: string | null; revision: number }> {
    const result = await clientOrPool.query(`select data, updated_at as "updatedAt", revision from app_state where state_key = $1${lock ? ' for update' : ''}`, [this.stateKey(companyId)]);
    const row = result.rows[0] as RecordItem | undefined;
    return { data: row?.data && typeof row.data === 'object' ? row.data : {}, updatedAt: row?.updatedAt || null, revision: Number(row?.revision || 0) };
  }

  @Post('reconcile-legacy')
  async reconcile(@Req() request: { headers: { cookie?: string } }, @Body() payload: unknown, @Res() response: any) {
    if (!this.pool) return response.status(503).type('application/json').send(JSON.stringify({ error: 'Reconciliação disponível somente com PostgreSQL.' }));
    try {
      const user = await this.authenticatedUser(request.headers.cookie);
      if (!user) return response.status(401).type('application/json').send(JSON.stringify({ error: 'É necessário entrar no sistema.' }));
      const isAdmin = user.platformAdmin || (user.role === 'admin' && user.companyId && user.companyId !== 'legacy') || user.founder || user.accountType === 'founder';
      if (!isAdmin) return response.status(403).type('application/json').send(JSON.stringify({ error: 'Apenas a administração pode reconciliar etapas comerciais legadas.' }));
      const companyId = user.companyId || 'legacy';
      const current = await this.state(this.pool, companyId);
      const reconciliation = commercialWorkflow.reconcileLegacyStages(current.data);
      const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RecordItem : {};
      if (input.apply !== true || !reconciliation.changes.length) {
        return response.status(200).type('application/json').send(JSON.stringify({ ok: true, applied: false, revision: current.revision, changes: reconciliation.changes }));
      }
      const now = new Date().toISOString();
      const auditEntry = {
        id: `audit-${crypto.randomUUID()}`,
        at: now,
        actor: user.name || user.username,
        action: 'Reconciliou etapas comerciais legadas',
        area: 'Comercial',
        detail: reconciliation.changes.map(change => `${change.company}: ${change.from} → ${change.to} (${change.reason})`).join(' · '),
      };
      const nextData = { ...reconciliation.data, auditLog: [auditEntry, ...(Array.isArray(current.data.auditLog) ? current.data.auditLog : [])].slice(0, 1000) };
      const stateKey = this.stateKey(companyId);
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:app_state:${stateKey}`]);
        const locked = await this.state(client, companyId, true);
        if (locked.revision !== current.revision) {
          await client.query('rollback');
          return response.status(409).type('application/json').send(JSON.stringify({ error: 'Os dados foram atualizados por outro aparelho. Faça uma nova verificação.', revision: locked.revision, updatedAt: locked.updatedAt }));
        }
        const saved = { updatedAt: now, revision: locked.revision + 1 };
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
        return response.status(200).type('application/json').send(JSON.stringify({ ok: true, applied: true, revision: saved.revision, updatedAt: saved.updatedAt, changes: reconciliation.changes }));
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Falha ao reconciliar etapas comerciais no PostgreSQL:', error instanceof Error ? error.message : error);
      return response.status(400).type('application/json').send(JSON.stringify({ error: 'Não foi possível reconciliar as etapas comerciais legadas.' }));
    }
  }
}
