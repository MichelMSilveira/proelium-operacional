import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Installation = { id: string; clientId: string; projectId: string; type: string; site: string; lead: string; stage: string; progress: number; due: string; status: string; [key: string]: unknown };

@Injectable()
export class InstallationsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);
  private readonly pool?: Pool;

  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PGPOOL_MAX || 10),
        connectionTimeoutMillis: 5000,
      });
    }
  }

  async list(cookie?: string): Promise<{ installations: Installation[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [installations, state] = await Promise.all([
        this.pool.query(
          `select id, client_id as "clientId", project_id as "projectId", type, site, lead, stage,
                  progress, due, status, extra_data as "extraData"
           from installations_domain_entries where company_id = $1 order by due asc, updated_at desc`,
          [context.companyId],
        ),
        this.pool.query('select revision from installations_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        installations: installations.rows.map((row) => this.installationFromRow(row)),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const current = await this.readAggregate(cookie, 'leitura das instalacoes');
    return { installations: this.normalizeList(current.data.installations), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de instalacao invalido.');
    const input = body as { installation?: unknown; baseRevision?: unknown };
    const installation = this.record(input.installation);
    if (!installation) throw new BadRequestException('Instalacao invalida.');
    const clientId = this.text(installation.clientId);
    const projectId = this.text(installation.projectId);
    const type = this.text(installation.type, 'Instalacao');
    const site = this.text(installation.site);
    const lead = this.text(installation.lead);
    if (!clientId || !projectId || !type || !site || !lead) throw new BadRequestException('A instalacao precisa conter cliente, projeto, tipo, local e responsavel.');
    const installationId = this.text(installation.id) || `ins-${crypto.randomUUID()}`;
    if (expectedId && installationId !== expectedId) throw new BadRequestException('O identificador da instalacao nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de instalacoes');
    const installations = Array.isArray(current.data.installations) ? current.data.installations : [];
    const index = installations.findIndex((entry) => this.sameId(entry, expectedId || installationId));
    if (expectedId && index < 0) throw new NotFoundException('Instalacao nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma instalacao com este identificador.');
    const normalized = this.normalize(installation, expectedId || installationId);
    const nextInstallations = expectedId
      ? installations.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [...installations, normalized];
    return this.forward({ ...current.data, installations: nextInstallations }, input.baseRevision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de instalacao invalido.');
    const input = body as { installation?: unknown; baseRevision?: unknown };
    const installation = this.record(input.installation);
    if (!installation) throw new BadRequestException('Instalacao invalida.');
    const clientId = this.text(installation.clientId);
    const projectId = this.text(installation.projectId);
    const type = this.text(installation.type, 'Instalacao');
    const site = this.text(installation.site);
    const lead = this.text(installation.lead);
    if (!clientId || !projectId || !type || !site || !lead) throw new BadRequestException('A instalacao precisa conter cliente, projeto, tipo, local e responsavel.');
    const installationId = this.text(installation.id) || `ins-${crypto.randomUUID()}`;
    if (expectedId && installationId !== expectedId) throw new BadRequestException('O identificador da instalacao nao confere.');
    const normalized = this.normalize(installation, expectedId || installationId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from installations_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Instalacao nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma instalacao com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(installation) };
      await client.query(
        `insert into installations_domain_entries
          (company_id, id, client_id, project_id, type, site, lead, stage, progress, due, status, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
         on conflict (company_id, id) do update set
           client_id = excluded.client_id, project_id = excluded.project_id, type = excluded.type,
           site = excluded.site, lead = excluded.lead, stage = excluded.stage, progress = excluded.progress,
           due = excluded.due, status = excluded.status, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.clientId, normalized.projectId, normalized.type, normalized.site,
          normalized.lead, normalized.stage, normalized.progress, normalized.due, normalized.status, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, installation: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async authContext(cookie?: string): Promise<AuthContext> {
    if (!cookie) throw new UnauthorizedException('Sessao obrigatoria.');
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: { cookie } }).catch(() => {
      throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    });
    if (upstream.status === 401) throw new UnauthorizedException('Sessao expirada.');
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    const payload = await upstream.json() as { user?: RecordItem };
    const user = payload.user;
    if (!user) throw new UnauthorizedException('Sessao invalida.');
    const permissions = Array.isArray(user.permissions) ? user.permissions.map((item) => this.text(item)) : [];
    const modules = Array.isArray(user.modules) ? user.modules.map((item) => this.text(item)) : [];
    if (this.text(user.role) !== 'admin' && !permissions.includes('installations') && !modules.includes('installations')) {
      throw new ForbiddenException('Seu perfil nao possui acesso as instalacoes.');
    }
    return {
      username: this.text(user.username, 'unknown'),
      companyId: this.text(user.companyId, 'legacy') || 'legacy',
      role: this.text(user.role, 'leitura'),
      permissions,
      modules,
    };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao') {
      throw new ForbiddenException('Seu perfil nao pode alterar instalacoes.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:installations:${companyId}`]);
    const result = await client.query('select revision from installations_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into installations_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update installations_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private installationFromRow(row: RecordItem): Installation {
    return this.normalize({ ...(this.record(row.extraData) || {}), id: row.id, clientId: row.clientId, projectId: row.projectId, type: row.type, site: row.site, lead: row.lead, stage: row.stage, progress: row.progress, due: row.due, status: row.status }, this.text(row.id));
  }

  private extraData(installation: RecordItem): RecordItem {
    const { id, clientId, projectId, type, site, lead, stage, progress, due, status, updatedAt, createdAt, ...extra } = installation;
    void id; void clientId; void projectId; void type; void site; void lead; void stage; void progress; void due; void status; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async readAggregate(cookie: string | undefined, action: string): Promise<AggregateResponse & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException(`Backend legado indisponivel para ${action}.`);
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException(`Nao foi possivel concluir a ${action}.`);
    try {
      const payload = JSON.parse(body) as AggregateResponse;
      return { ...payload, data: payload.data && typeof payload.data === 'object' ? payload.data : {} };
    } catch {
      throw new ServiceUnavailableException('Resposta invalida do backend legado.');
    }
  }

  private async forward(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de instalacoes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Installation[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalize(item, this.text(item.id, `legacy-installation-${index + 1}`)));
  }

  private normalize(item: RecordItem, id: string): Installation {
    return {
      ...item,
      id,
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      type: this.text(item.type, 'Instalacao'),
      site: this.text(item.site),
      lead: this.text(item.lead),
      stage: this.text(item.stage, 'Planejamento'),
      progress: this.percent(item.progress),
      due: this.text(item.due),
      status: this.text(item.status, 'Planejamento'),
    };
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private percent(value: unknown): number { const result = Number(value); return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : 0; }
}
