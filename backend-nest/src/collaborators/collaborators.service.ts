import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Collaborator = {
  id: string;
  name: string;
  role: string;
  specialty: string;
  relationship: string;
  availability: string;
  compensation: string;
  status: string;
  [key: string]: unknown;
};

@Injectable()
export class CollaboratorsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
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

  async list(cookie?: string): Promise<{ collaborators: Collaborator[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [collaborators, state] = await Promise.all([
      this.pool.query(
        `select id, name, role, specialty, relationship, availability, compensation, status, extra_data as "extraData"
         from collaborators_domain_entries where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool.query('select revision from collaborators_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      collaborators: collaborators.rows.map((row) => this.collaboratorFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de colaborador invalido.');
    const input = body as { collaborator?: unknown; baseRevision?: unknown };
    const collaborator = this.record(input.collaborator);
    if (!collaborator) throw new BadRequestException('Colaborador invalido.');
    const name = this.text(collaborator.name);
    const role = this.text(collaborator.role);
    if (!name || !role) throw new BadRequestException('O colaborador precisa conter nome e funcao.');
    const collaboratorId = this.text(collaborator.id) || `col-${crypto.randomUUID()}`;
    if (expectedId && collaboratorId !== expectedId) throw new BadRequestException('O identificador do colaborador nao confere.');
    const normalized = this.normalize(collaborator, expectedId || collaboratorId);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from collaborators_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Colaborador nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um colaborador com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(collaborator),
      };
      await client.query(
        `insert into collaborators_domain_entries
          (company_id, id, name, role, specialty, relationship, availability, compensation, status, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
         on conflict (company_id, id) do update set
           name = excluded.name, role = excluded.role, specialty = excluded.specialty,
           relationship = excluded.relationship, availability = excluded.availability,
           compensation = excluded.compensation, status = excluded.status,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.name, normalized.role, normalized.specialty, normalized.relationship,
          normalized.availability, normalized.compensation, normalized.status, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, collaborator: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async authContext(cookie?: string): Promise<AuthContext> {
    if (!cookie) throw new UnauthorizedException('Sessao obrigatoria.');
    const upstream = await fetch(`${this.legacyOrigin}/api/auth/me`, { headers: { cookie } }).catch(() => {
      throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    });
    if (upstream.status === 401) throw new UnauthorizedException('Sessao expirada.');
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    const payload = await upstream.json() as { user?: RecordItem };
    const user = payload.user;
    if (!user) throw new UnauthorizedException('Sessao invalida.');
    const permissions = Array.isArray(user.permissions) ? user.permissions.map((item) => this.text(item)) : [];
    const modules = Array.isArray(user.modules) ? user.modules.map((item) => this.text(item)) : [];
    if (this.text(user.role) !== 'admin' && !permissions.includes('collaborators') && !modules.includes('collaborators')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos colaboradores.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar colaboradores.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:collaborators:${companyId}`]);
    const result = await client.query('select revision from collaborators_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into collaborators_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update collaborators_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private collaboratorFromRow(row: RecordItem): Collaborator {
    return this.normalize({ ...(this.record(row.extraData) || {}), id: row.id, name: row.name, role: row.role, specialty: row.specialty, relationship: row.relationship, availability: row.availability, compensation: row.compensation, status: row.status }, this.text(row.id));
  }

  private extraData(collaborator: RecordItem): RecordItem {
    const { id, name, role, specialty, relationship, availability, compensation, status, updatedAt, createdAt, ...extra } = collaborator;
    void id; void name; void role; void specialty; void relationship; void availability; void compensation; void status; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ collaborators: Collaborator[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura de colaboradores');
    return { collaborators: this.normalizeList(current.data.collaborators), revision: current.revision };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de colaborador invalido.');
    const input = body as { collaborator?: unknown; baseRevision?: unknown };
    const collaborator = this.record(input.collaborator);
    if (!collaborator) throw new BadRequestException('Colaborador invalido.');
    const name = this.text(collaborator.name);
    const role = this.text(collaborator.role);
    if (!name || !role) throw new BadRequestException('O colaborador precisa conter nome e funcao.');
    const collaboratorId = this.text(collaborator.id) || `col-${crypto.randomUUID()}`;
    if (expectedId && collaboratorId !== expectedId) throw new BadRequestException('O identificador do colaborador nao confere.');
    const current = await this.readAggregate(cookie, 'gravacao de colaboradores');
    const collaborators = Array.isArray(current.data.collaborators) ? current.data.collaborators : [];
    const index = collaborators.findIndex((entry) => this.sameId(entry, expectedId || collaboratorId));
    if (expectedId && index < 0) throw new NotFoundException('Colaborador nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um colaborador com este identificador.');
    const normalized = this.normalize(collaborator, expectedId || collaboratorId);
    const nextCollaborators = expectedId
      ? collaborators.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...collaborators];
    return this.forward({ ...current.data, collaborators: nextCollaborators }, input.baseRevision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de colaboradores.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Collaborator[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalize(item, this.text(item.id, `legacy-collaborator-${index + 1}`)));
  }

  private normalize(item: RecordItem, id: string): Collaborator {
    return {
      ...item,
      id,
      name: this.text(item.name, 'Colaborador sem nome'),
      role: this.text(item.role),
      specialty: this.text(item.specialty),
      relationship: this.text(item.relationship),
      availability: this.text(item.availability),
      compensation: this.text(item.compensation),
      status: this.text(item.status, 'Ativo'),
    };
  }

  private record(value: unknown): RecordItem | null { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null; }
  private sameId(value: unknown, expectedId: string): boolean { const item = this.record(value); return item !== null && this.text(item.id) === expectedId; }
  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
