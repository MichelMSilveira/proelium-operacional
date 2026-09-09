import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type TechnicalConnection = RecordItem & {
  id: string;
  projectId: string;
  fromId: string;
  fromLabel: string;
  fromPort: string;
  toId: string;
  toLabel: string;
  toPort: string;
  cable: string;
  status: string;
};

@Injectable()
export class DiagramService {
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

  async list(cookie?: string): Promise<{ connections: TechnicalConnection[]; edits: RecordItem[]; overrides: RecordItem[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [connections, edits, overrides, state] = await Promise.all([
        this.pool.query(
          `select id, project_id as "projectId", from_id as "fromId", from_label as "fromLabel", from_port as "fromPort",
                  to_id as "toId", to_label as "toLabel", to_port as "toPort", cable, status, cable_count as "cableCount",
                  origin, extra_data as "extraData"
           from diagram_domain_connections where company_id = $1 order by updated_at desc, project_id asc, from_label asc`,
          [context.companyId],
        ),
        this.pool.query(`select record_data as "recordData" from diagram_domain_aux_records where company_id = $1 and kind = 'edit' order by updated_at desc`, [context.companyId]),
        this.pool.query(`select record_data as "recordData" from diagram_domain_aux_records where company_id = $1 and kind = 'override' order by updated_at desc`, [context.companyId]),
        this.pool.query('select revision from diagram_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        connections: connections.rows.map((row) => this.connectionFromRow(row)),
        edits: edits.rows.map((row) => this.record(row.recordData)).filter((item): item is RecordItem => item !== null),
        overrides: overrides.rows.map((row) => this.record(row.recordData)).filter((item): item is RecordItem => item !== null),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const current = await this.readAggregate(cookie, 'leitura do diagrama');
    return {
      connections: this.normalizeList(current.data.technicalConnections),
      edits: this.normalizeRecords(current.data.technicalConnectionEdits),
      overrides: this.normalizeRecords(current.data.technicalConnectionOverrides),
      revision: current.revision,
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ligacao tecnica invalido.');
    const input = body as { connection?: unknown; baseRevision?: unknown };
    const connection = this.record(input.connection);
    if (!connection) throw new BadRequestException('Ligacao tecnica invalida.');
    const projectId = this.text(connection.projectId);
    const fromId = this.text(connection.fromId);
    const toId = this.text(connection.toId);
    const fromLabel = this.text(connection.fromLabel, fromId || 'Origem externa');
    const toLabel = this.text(connection.toLabel, toId || 'Destino a confirmar');
    const fromPort = this.text(connection.fromPort, 'Saida a confirmar');
    const toPort = this.text(connection.toPort, 'Entrada a confirmar');
    const cable = this.text(connection.cable, 'Cabo a confirmar');
    if (!projectId || !toId || fromId === toId) throw new BadRequestException('A ligacao precisa conter projeto, origem e destino diferentes.');
    if (!fromPort || !toPort || !cable) throw new BadRequestException('A ligacao precisa conter portas e cabo.');
    const current = await this.readAggregate(cookie, 'gravacao do diagrama');
    const projects = Array.isArray(current.data.projects) ? current.data.projects : [];
    if (!projects.some((item) => this.sameId(item, projectId))) throw new NotFoundException('Projeto nao encontrado.');
    const connections = this.normalizeList(current.data.technicalConnections);
    const connectionId = this.text(connection.id) || `conn-next-${crypto.randomUUID()}`;
    const index = connections.findIndex((item) => item.id === (expectedId || connectionId));
    if (expectedId && index < 0) throw new NotFoundException('Ligacao tecnica nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma ligacao com este identificador.');
    const duplicate = connections.some((item, itemIndex) => itemIndex !== index && item.projectId === projectId && item.fromId === fromId && item.fromPort === fromPort && item.toId === toId && item.toPort === toPort);
    if (duplicate) throw new BadRequestException('Essa ligacao ja esta registrada.');
    const normalized = this.normalizeConnection(connection, expectedId || connectionId);
    const nextConnections = expectedId
      ? connections.map((item, itemIndex) => itemIndex === index ? normalized : item)
      : [normalized, ...connections];
    return this.forward({ ...current.data, technicalConnections: nextConnections }, input.baseRevision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ligacao tecnica invalido.');
    const input = body as { connection?: unknown; baseRevision?: unknown };
    const connection = this.record(input.connection);
    if (!connection) throw new BadRequestException('Ligacao tecnica invalida.');
    const projectId = this.text(connection.projectId);
    const fromId = this.text(connection.fromId);
    const toId = this.text(connection.toId);
    const fromPort = this.text(connection.fromPort);
    const toPort = this.text(connection.toPort);
    const cable = this.text(connection.cable);
    if (!projectId || !toId || fromId === toId) throw new BadRequestException('A ligacao precisa conter projeto, origem e destino diferentes.');
    if (!fromPort || !toPort || !cable) throw new BadRequestException('A ligacao precisa conter portas e cabo.');
    const connectionId = this.text(connection.id) || `conn-next-${crypto.randomUUID()}`;
    if (expectedId && connectionId !== expectedId) throw new BadRequestException('O identificador da ligacao nao confere.');
    const normalized = this.normalizeConnection(connection, expectedId || connectionId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const project = await client.query('select id from projects_domain_entries where company_id = $1 and id = $2', [context.companyId, projectId]);
      if (!project.rowCount) throw new NotFoundException('Projeto nao encontrado.');
      const existing = await client.query('select id, extra_data as "extraData" from diagram_domain_connections where company_id = $1 and id = $2', [context.companyId, normalized.id]);
      if (expectedId && !existing.rowCount) throw new NotFoundException('Ligacao tecnica nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma ligacao com este identificador.');
      const duplicate = await client.query(
        `select id from diagram_domain_connections
         where company_id = $1 and project_id = $2 and from_id = $3 and from_port = $4 and to_id = $5 and to_port = $6 and id <> $7 limit 1`,
        [context.companyId, normalized.projectId, normalized.fromId, normalized.fromPort, normalized.toId, normalized.toPort, normalized.id],
      );
      if (duplicate.rowCount) throw new BadRequestException('Essa ligacao ja esta registrada.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(connection) };
      await client.query(
        `insert into diagram_domain_connections
          (company_id, id, project_id, from_id, from_label, from_port, to_id, to_label, to_port, cable, status, cable_count, origin, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
         on conflict (company_id, id) do update set
           project_id = excluded.project_id, from_id = excluded.from_id, from_label = excluded.from_label, from_port = excluded.from_port,
           to_id = excluded.to_id, to_label = excluded.to_label, to_port = excluded.to_port, cable = excluded.cable,
           status = excluded.status, cable_count = excluded.cable_count, origin = excluded.origin,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.projectId, normalized.fromId, normalized.fromLabel, normalized.fromPort, normalized.toId,
          normalized.toLabel, normalized.toPort, normalized.cable, normalized.status, normalized.cableCount, normalized.origin, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, connection: normalized }) };
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
    const role = this.text(user.role);
    const diagramAccess = role === 'admin' || permissions.includes('*') || permissions.includes('diagram') || permissions.includes('projects') || modules.includes('diagram') || modules.includes('projects');
    if (!diagramAccess) throw new ForbiddenException('Seu perfil nao possui acesso ao diagrama.');
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: role || 'leitura', permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao' && context.role !== 'operador') throw new ForbiddenException('Seu perfil nao pode alterar o diagrama.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:diagram:${companyId}`]);
    const result = await client.query('select revision from diagram_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into diagram_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update diagram_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
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
      body: JSON.stringify({ data, baseRevision, resource: 'diagram' }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do diagrama.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private connectionFromRow(row: RecordItem): TechnicalConnection {
    return this.normalizeConnection({ ...(this.record(row.extraData) || {}), id: row.id, projectId: row.projectId, fromId: row.fromId, fromLabel: row.fromLabel, fromPort: row.fromPort, toId: row.toId, toLabel: row.toLabel, toPort: row.toPort, cable: row.cable, status: row.status, cableCount: row.cableCount, origin: row.origin }, this.text(row.id));
  }

  private normalizeConnection(item: RecordItem, id: string): TechnicalConnection {
    const fromId = this.text(item.fromId);
    const toId = this.text(item.toId);
    return {
      ...item,
      id,
      projectId: this.text(item.projectId),
      fromId,
      fromLabel: this.text(item.fromLabel, fromId || 'Origem externa'),
      fromPort: this.text(item.fromPort, 'Saida a confirmar'),
      toId,
      toLabel: this.text(item.toLabel, toId || 'Destino a confirmar'),
      toPort: this.text(item.toPort, 'Entrada a confirmar'),
      cable: this.text(item.cable, 'Cabo a confirmar'),
      status: this.text(item.status, 'Proposto - confirmar'),
      cableCount: Number(item.cableCount) > 0 ? Number(item.cableCount) : 1,
      origin: this.text(item.origin, 'Manual Proelium'),
    };
  }

  private extraData(item: RecordItem): RecordItem {
    const { id, projectId, fromId, fromLabel, fromPort, toId, toLabel, toPort, cable, status, cableCount, origin, updatedAt, createdAt, ...extra } = item;
    void id; void projectId; void fromId; void fromLabel; void fromPort; void toId; void toLabel; void toPort; void cable; void status; void cableCount; void origin; void updatedAt; void createdAt;
    return extra;
  }

  private normalizeList(value: unknown): TechnicalConnection[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeConnection(item, this.text(item.id, `legacy-connection-${index + 1}`)));
  }

  private normalizeRecords(value: unknown): RecordItem[] {
    return Array.isArray(value) ? value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object') : [];
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
