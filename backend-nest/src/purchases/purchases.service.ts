import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type PurchaseItem = {
  id: string;
  projectId: string;
  sourceKey: string;
  room: string;
  productId: string;
  name: string;
  qty: number;
  unit: string;
  status: string;
  supplier: string;
  note: string;
  [key: string]: unknown;
};

const statuses = ['Planejado', 'A cotar', 'Comprado', 'Recebido', 'Conferido'];

@Injectable()
export class PurchasesService {
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

  async list(cookie?: string): Promise<{ purchases: PurchaseItem[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [purchases, state] = await Promise.all([
        this.pool.query(
          `select id, project_id as "projectId", source_key as "sourceKey", room, product_id as "productId", name,
                  qty, unit, status, supplier, note, extra_data as "extraData"
           from purchases_domain_entries where company_id = $1 order by updated_at desc, project_id asc, name asc`,
          [context.companyId],
        ),
        this.pool.query('select revision from purchases_domain_state where company_id = $1', [context.companyId]),
      ]);
      return { purchases: purchases.rows.map((row) => this.purchaseFromRow(row)), revision: Number(state.rows[0]?.revision || 0) };
    }
    const current = await this.readAggregate(cookie, 'leitura de compras');
    return { purchases: this.normalizeList(current.data.purchaseItems), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de item de compra invalido.');
    const input = body as { purchase?: unknown; baseRevision?: unknown };
    const item = this.record(input.purchase);
    if (!item) throw new BadRequestException('Item de compra invalido.');
    const name = this.text(item.name ?? item.description ?? item.nome);
    const projectId = this.text(item.projectId);
    if (!name || !projectId) throw new BadRequestException('O item precisa conter projeto e nome.');
    const qty = this.number(item.qty ?? item.quantity ?? item.quantidade);
    if (qty <= 0) throw new BadRequestException('A quantidade precisa ser maior que zero.');
    const itemId = this.text(item.id) || `buy-${crypto.randomUUID()}`;
    if (expectedId && itemId !== expectedId) throw new BadRequestException('O identificador do item nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de compras');
    const items = Array.isArray(current.data.purchaseItems) ? current.data.purchaseItems : [];
    const index = items.findIndex((entry) => this.sameId(entry, expectedId || itemId));
    if (expectedId && index < 0) throw new NotFoundException('Item de compra nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um item com este identificador.');
    const normalized = {
      ...item,
      id: expectedId || itemId,
      projectId,
      sourceKey: this.text(item.sourceKey),
      room: this.text(item.room),
      productId: this.text(item.productId),
      name,
      qty,
      unit: this.text(item.unit, 'un'),
      status: statuses.includes(this.text(item.status)) ? this.text(item.status) : 'Planejado',
      supplier: this.text(item.supplier),
      note: this.text(item.note),
    };
    const nextItems = expectedId
      ? items.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [...items, normalized];
    return this.forward({ ...current.data, purchaseItems: nextItems }, input.baseRevision, cookie);
  }

  async remove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador do item e obrigatorio.');
    if (this.pool) return this.databaseRemove(id, cookie);
    const current = await this.readAggregate(cookie, 'gravacao de compras');
    const items = Array.isArray(current.data.purchaseItems) ? current.data.purchaseItems : [];
    if (!items.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Item de compra nao encontrado.');
    return this.forward({ ...current.data, purchaseItems: items.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de item de compra invalido.');
    const input = body as { purchase?: unknown; baseRevision?: unknown };
    const item = this.record(input.purchase);
    if (!item) throw new BadRequestException('Item de compra invalido.');
    const name = this.text(item.name ?? item.description ?? item.nome);
    const projectId = this.text(item.projectId);
    if (!name || !projectId) throw new BadRequestException('O item precisa conter projeto e nome.');
    const qty = this.number(item.qty ?? item.quantity ?? item.quantidade);
    if (qty <= 0) throw new BadRequestException('A quantidade precisa ser maior que zero.');
    const itemId = this.text(item.id) || `buy-${crypto.randomUUID()}`;
    if (expectedId && itemId !== expectedId) throw new BadRequestException('O identificador do item nao confere.');
    const normalized = this.normalizeItem(item, expectedId || itemId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from purchases_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Item de compra nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um item com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(item) };
      await client.query(
        `insert into purchases_domain_entries
          (company_id, id, project_id, source_key, room, product_id, name, qty, unit, status, supplier, note, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
         on conflict (company_id, id) do update set
           project_id = excluded.project_id, source_key = excluded.source_key, room = excluded.room,
           product_id = excluded.product_id, name = excluded.name, qty = excluded.qty, unit = excluded.unit,
           status = excluded.status, supplier = excluded.supplier, note = excluded.note,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.projectId, normalized.sourceKey, normalized.room, normalized.productId,
          normalized.name, normalized.qty, normalized.unit, normalized.status, normalized.supplier, normalized.note, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, purchase: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseRemove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      const deleted = await client.query('delete from purchases_domain_entries where company_id = $1 and id = $2 returning id', [context.companyId, id.trim()]);
      if (!deleted.rowCount) throw new NotFoundException('Item de compra nao encontrado.');
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, previousRevision: currentRevision }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('purchases') && !modules.includes('purchases')) {
      throw new ForbiddenException('Seu perfil nao possui acesso as compras.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: this.text(user.role, 'leitura'), permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao') throw new ForbiddenException('Seu perfil nao pode alterar compras.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:purchases:${companyId}`]);
    const result = await client.query('select revision from purchases_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into purchases_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update purchases_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
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
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de compras.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): PurchaseItem[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-purchase-${index + 1}`),
      projectId: this.text(item.projectId),
      sourceKey: this.text(item.sourceKey),
      room: this.text(item.room),
      productId: this.text(item.productId),
      name: this.text(item.name ?? item.description ?? item.nome, 'Material sem nome'),
      qty: this.number(item.qty ?? item.quantity ?? item.quantidade),
      unit: this.text(item.unit, 'un'),
      status: statuses.includes(this.text(item.status)) ? this.text(item.status) : 'Planejado',
      supplier: this.text(item.supplier ?? item.fornecedor),
      note: this.text(item.note ?? item.observation),
    }));
  }

  private purchaseFromRow(row: RecordItem): PurchaseItem {
    return this.normalizeItem({ ...(this.record(row.extraData) || {}), id: row.id, projectId: row.projectId, sourceKey: row.sourceKey, room: row.room, productId: row.productId, name: row.name, qty: row.qty, unit: row.unit, status: row.status, supplier: row.supplier, note: row.note }, this.text(row.id));
  }

  private normalizeItem(item: RecordItem, id: string): PurchaseItem {
    const name = this.text(item.name ?? item.description ?? item.nome, 'Material sem nome');
    return {
      ...item,
      id,
      projectId: this.text(item.projectId),
      sourceKey: this.text(item.sourceKey),
      room: this.text(item.room),
      productId: this.text(item.productId),
      name,
      qty: this.number(item.qty ?? item.quantity ?? item.quantidade),
      unit: this.text(item.unit, 'un'),
      status: statuses.includes(this.text(item.status)) ? this.text(item.status) : 'Planejado',
      supplier: this.text(item.supplier ?? item.fornecedor),
      note: this.text(item.note ?? item.observation),
    };
  }

  private extraData(item: RecordItem): RecordItem {
    const { id, projectId, sourceKey, room, productId, name, description, nome, qty, quantity, quantidade, unit, status, supplier, fornecedor, note, observation, updatedAt, createdAt, ...extra } = item;
    void id; void projectId; void sourceKey; void room; void productId; void name; void description; void nome; void qty; void quantity; void quantidade; void unit; void status; void supplier; void fornecedor; void note; void observation; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
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

  private number(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : 0;
  }
}
