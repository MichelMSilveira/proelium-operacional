import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type Aggregate = { revision?: number; data?: Record<string, unknown> };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Client = {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  [key: string]: unknown;
};

@Injectable()
export class ClientsService {
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

  async list(cookie?: string): Promise<{ clients: Client[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [clients, state] = await Promise.all([
      this.pool.query(
        `select id, name, document, email, phone, address, extra_data as "extraData"
         from clients_domain_entries where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool.query('select revision from clients_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      clients: clients.rows.map((row) => this.clientFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { client?: unknown; baseRevision?: unknown };
    const clientRecord = this.record(input.client);
    if (!clientRecord) throw new BadRequestException('A gravacao precisa conter um cliente valido.');
    const clientId = this.text(clientRecord.id);
    if (!clientId) throw new BadRequestException('O cliente precisa conter identificador.');
    if (expectedId && clientId !== expectedId) throw new BadRequestException('O identificador do cliente nao confere.');
    const normalized = {
      id: expectedId || clientId,
      name: this.text(clientRecord.name ?? clientRecord.nome, 'Cliente sem nome'),
      document: this.text(clientRecord.document),
      email: this.text(clientRecord.email),
      phone: this.text(clientRecord.phone ?? clientRecord.telefone),
      address: this.text(clientRecord.address ?? clientRecord.endereco),
    };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from clients_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Cliente nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um cliente com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(clientRecord),
      };
      await client.query(
        `insert into clients_domain_entries
          (company_id, id, name, document, email, phone, address, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
         on conflict (company_id, id) do update set
           name = excluded.name, document = excluded.document, email = excluded.email,
           phone = excluded.phone, address = excluded.address, extra_data = excluded.extra_data,
           updated_at = now()`,
        [context.companyId, normalized.id, normalized.name, normalized.document, normalized.email,
          normalized.phone, normalized.address, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, client: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacyRemove(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!expectedId?.trim()) throw new BadRequestException('O identificador do cliente e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const deleted = await client.query(
        'delete from clients_domain_entries where company_id = $1 and id = $2 returning id',
        [context.companyId, expectedId],
      );
      if (!deleted.rowCount) throw new NotFoundException('Cliente nao encontrado.');
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('clients') && !modules.includes('clients')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos clientes.');
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
    if (context.role !== 'admin' && context.role !== 'comercial') {
      throw new ForbiddenException('Seu perfil nao pode alterar clientes.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:clients:${companyId}`]);
    const result = await client.query('select revision from clients_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into clients_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update clients_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private clientFromRow(row: RecordItem): Client {
    return {
      ...(this.record(row.extraData) || {}),
      id: this.text(row.id),
      name: this.text(row.name, 'Cliente sem nome'),
      document: this.text(row.document),
      email: this.text(row.email),
      phone: this.text(row.phone),
      address: this.text(row.address),
    };
  }

  private extraData(client: RecordItem): RecordItem {
    const { id, name, nome, document, email, phone, telefone, address, endereco, updatedAt, createdAt, ...extra } = client;
    void id; void name; void nome; void document; void email; void phone; void telefone; void address; void endereco; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ clients: Client[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de clientes.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os clientes.');
    const payload = await upstream.json() as Aggregate;
    return { clients: this.normalizeList(payload.data?.clients), revision: payload.revision };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { client?: unknown; baseRevision?: unknown };
    const client = this.record(input.client);
    if (!client) throw new BadRequestException('A gravacao precisa conter um cliente valido.');
    const clientId = this.text(client.id);
    if (!clientId) throw new BadRequestException('O cliente precisa conter identificador.');
    if (expectedId && clientId !== expectedId) throw new BadRequestException('O identificador do cliente nao confere.');
    const current = await this.readAggregate(cookie);
    const currentClients = Array.isArray(current.data?.clients) ? current.data.clients : [];
    const index = currentClients.findIndex((item) => this.sameId(item, expectedId || clientId));
    if (expectedId && index < 0) throw new NotFoundException('Cliente nao encontrado.');
    const clients = expectedId
      ? currentClients.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...client, id: expectedId } : item)
      : [...currentClients, client];
    return this.forwardSave({ ...current.data, clients }, input.baseRevision, cookie);
  }

  private async legacyRemove(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!expectedId) throw new BadRequestException('O identificador do cliente e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const current = await this.readAggregate(cookie);
    const currentClients = Array.isArray(current.data?.clients) ? current.data.clients : [];
    if (!currentClients.some((item) => this.sameId(item, expectedId))) throw new NotFoundException('Cliente nao encontrado.');
    return this.forwardSave({ ...current.data, clients: currentClients.filter((item) => !this.sameId(item, expectedId)) }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de clientes.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de clientes.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de clientes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Client[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object')
      .map((item, index) => ({
        ...item,
        id: this.text(item.id, `legacy-client-${index + 1}`),
        name: this.text(item.name ?? item.nome, 'Cliente sem nome'),
        document: this.text(item.document),
        email: this.text(item.email),
        phone: this.text(item.phone ?? item.telefone),
        address: this.text(item.address ?? item.endereco),
      }));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
