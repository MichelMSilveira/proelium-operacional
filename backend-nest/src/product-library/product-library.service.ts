import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type Aggregate = { revision?: number; data?: Record<string, unknown> };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type ManufacturerEntry = { id: string; name: string; areas: string; source: string; status: string; [key: string]: unknown };

@Injectable()
export class ProductLibraryService {
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

  async list(cookie?: string): Promise<{ entries: ManufacturerEntry[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [entries, state] = await Promise.all([
      this.pool.query(
        `select id, name, areas, source, status, extra_data as "extraData"
         from product_library_domain_entries where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool.query('select revision from product_library_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      entries: entries.rows.map((row) => this.entryFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de fabricante invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry) throw new BadRequestException('A gravacao precisa conter um fabricante valido.');
    const name = this.text(entry.name);
    if (!name) throw new BadRequestException('O fabricante precisa conter nome.');
    const entryId = this.text(entry.id) || `mfr-next-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do fabricante nao confere.');
    const normalized = {
      id: expectedId || entryId,
      name,
      areas: this.text(entry.areas ?? entry.category),
      source: this.text(entry.source),
      status: this.text(entry.status, 'Fonte oficial a consultar'),
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
        'select id, extra_data as "extraData" from product_library_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Fabricante nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um fabricante com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(entry),
      };
      await client.query(
        `insert into product_library_domain_entries
          (company_id, id, name, areas, source, status, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
         on conflict (company_id, id) do update set
           name = excluded.name, areas = excluded.areas, source = excluded.source,
           status = excluded.status, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.name, normalized.areas, normalized.source, normalized.status, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return {
        status: expectedId ? 200 : 201,
        body: JSON.stringify({ ok: true, revision: nextRevision, entry: normalized }),
      };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('products') && !permissions.includes('productLibrary') && !modules.includes('products') && !modules.includes('productLibrary')) {
      throw new ForbiddenException('Seu perfil nao possui acesso a biblioteca tecnica.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar a biblioteca tecnica.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:product-library:${companyId}`]);
    const result = await client.query(
      'select revision from product_library_domain_state where company_id = $1 for update',
      [companyId],
    );
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into product_library_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update product_library_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private entryFromRow(row: RecordItem): ManufacturerEntry {
    return {
      ...(this.record(row.extraData) || {}),
      id: this.text(row.id),
      name: this.text(row.name, 'Fabricante sem nome'),
      areas: this.text(row.areas),
      source: this.text(row.source),
      status: this.text(row.status, 'Fonte oficial a consultar'),
    };
  }

  private extraData(entry: RecordItem): RecordItem {
    const { id, name, areas, category, source, status, updatedAt, createdAt, ...extra } = entry;
    void id; void name; void areas; void category; void source; void status; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ entries: ManufacturerEntry[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura da biblioteca tecnica.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar a biblioteca tecnica.');
    const payload = await upstream.json() as Aggregate;
    return { entries: this.normalizeList(payload.data?.manufacturerLibrary), revision: payload.revision };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de fabricante invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry || !this.text(entry.name)) throw new BadRequestException('O fabricante precisa conter nome.');
    const entryId = this.text(entry.id);
    if (expectedId && (!entryId || entryId !== expectedId)) throw new BadRequestException('O identificador do fabricante nao confere.');
    const current = await this.readAggregate(cookie);
    const currentEntries = Array.isArray(current.data.manufacturerLibrary) ? current.data.manufacturerLibrary : [];
    const index = currentEntries.findIndex((item) => this.sameId(item, expectedId || entryId));
    if (expectedId && index < 0) throw new NotFoundException('Fabricante nao encontrado.');
    const normalized = {
      ...entry,
      id: expectedId || entryId || `manufacturer-${Date.now()}`,
      name: this.text(entry.name),
      areas: this.text(entry.areas ?? entry.category),
      source: this.text(entry.source),
      status: this.text(entry.status, 'Fonte oficial a consultar'),
    };
    const entries = expectedId
      ? currentEntries.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [...currentEntries, normalized];
    return this.forwardSave({ ...current.data, manufacturerLibrary: entries }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao da biblioteca tecnica.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao da biblioteca tecnica.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao da biblioteca tecnica.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): ManufacturerEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object')
      .map((item, index) => ({
        ...item,
        id: this.text(item.id, `legacy-manufacturer-${index + 1}`),
        name: this.text(item.name, 'Fabricante sem nome'),
        areas: this.text(item.areas ?? item.category),
        source: this.text(item.source),
        status: this.text(item.status, 'Fonte oficial a consultar'),
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
