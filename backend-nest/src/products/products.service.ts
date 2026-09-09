import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type Aggregate = { revision?: number; data?: Record<string, unknown> };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Product = { id: string; name: string; sku: string; category: string; unit: string; price: number; active: boolean; [key: string]: unknown };

@Injectable()
export class ProductsService {
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

  async list(cookie?: string): Promise<{ products: Product[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [products, state] = await Promise.all([
      this.pool.query(
        `select id, catalog_type as "catalogType", name, sku, category, unit, price, active, extra_data as "extraData"
         from products_domain_entries where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool.query('select revision from products_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      products: products.rows.map((row) => this.productFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async services(cookie?: string): Promise<{ services: Product[]; revision?: number }> {
    const resource = await this.list(cookie);
    const services = resource.products.filter((item) => this.isService(item));
    return { services, revision: resource.revision };
  }

  async saveService(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de servico invalido.');
    const input = body as { service?: unknown; baseRevision?: unknown };
    const service = this.record(input.service);
    if (!service) throw new BadRequestException('A gravacao precisa conter um servico valido.');
    return this.save({ product: { ...service, catalogType: 'service' }, baseRevision: input.baseRevision }, cookie, expectedId, 'service');
  }

  async save(body: unknown, cookie?: string, expectedId?: string, expectedCatalogType?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId, expectedCatalogType);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { product?: unknown; baseRevision?: unknown };
    const product = this.record(input.product);
    if (!product) throw new BadRequestException('A gravacao precisa conter um produto valido.');
    const productId = this.text(product.id);
    if (!productId) throw new BadRequestException('O produto precisa conter identificador.');
    if (expectedId && productId !== expectedId) throw new BadRequestException('O identificador do produto nao confere.');
    const catalogType = expectedCatalogType || (this.isService(product) ? 'service' : 'product');
    const name = this.text(product.name ?? product.nome);
    if (!name) throw new BadRequestException('O produto precisa conter nome.');
    const normalized = {
      id: expectedId || productId,
      catalogType,
      name,
      sku: this.text(product.sku),
      category: this.text(product.category),
      unit: this.text(product.unit ?? product.unidade, catalogType === 'service' ? 'h' : 'un'),
      price: this.number(product.price),
      active: product.active !== false,
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
        'select id, catalog_type as "catalogType", extra_data as "extraData" from products_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException(expectedCatalogType === 'service' ? 'Servico nao encontrado.' : 'Produto nao encontrado.');
      if (expectedId && expectedCatalogType && existing.rows[0].catalogType !== expectedCatalogType) {
        throw new NotFoundException(expectedCatalogType === 'service' ? 'Servico nao encontrado.' : 'Produto nao encontrado.');
      }
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um item com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(product),
      };
      await client.query(
        `insert into products_domain_entries
          (company_id, id, catalog_type, name, sku, category, unit, price, active, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
         on conflict (company_id, id) do update set
           catalog_type = excluded.catalog_type, name = excluded.name, sku = excluded.sku,
           category = excluded.category, unit = excluded.unit, price = excluded.price,
           active = excluded.active, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.catalogType, normalized.name, normalized.sku, normalized.category,
          normalized.unit, normalized.price, normalized.active, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return {
        status: expectedId ? 200 : 201,
        body: JSON.stringify({ ok: true, revision: nextRevision, product: normalized, service: catalogType === 'service' ? normalized : undefined }),
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('products') && !modules.includes('products')) {
      throw new ForbiddenException('Seu perfil nao possui acesso ao catalogo de produtos.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar o catalogo de produtos.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:products:${companyId}`]);
    const result = await client.query('select revision from products_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into products_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update products_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private productFromRow(row: RecordItem): Product {
    const extra = this.record(row.extraData) || {};
    return {
      ...extra,
      id: this.text(row.id),
      ...(this.text(row.catalogType) === 'service' ? { catalogType: 'service' } : {}),
      name: this.text(row.name, 'Produto sem nome'),
      sku: this.text(row.sku),
      category: this.text(row.category),
      unit: this.text(row.unit, 'un'),
      price: this.number(row.price),
      active: row.active !== false,
    };
  }

  private extraData(product: RecordItem): RecordItem {
    const { id, catalogType, name, nome, sku, category, unit, unidade, price, active, mode, updatedAt, createdAt, ...extra } = product;
    void id; void catalogType; void name; void nome; void sku; void category; void unit; void unidade; void price; void active; void mode; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ products: Product[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de produtos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os produtos.');
    const payload = await upstream.json() as Aggregate;
    return { products: this.normalizeList(payload.data?.products), revision: payload.revision };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string, expectedCatalogType?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { product?: unknown; baseRevision?: unknown };
    const product = this.record(input.product);
    if (!product) throw new BadRequestException('A gravacao precisa conter um produto valido.');
    const productId = this.text(product.id);
    if (!productId) throw new BadRequestException('O produto precisa conter identificador.');
    if (expectedId && productId !== expectedId) throw new BadRequestException('O identificador do produto nao confere.');
    const current = await this.readAggregate(cookie);
    const currentProducts = Array.isArray(current.data.products) ? current.data.products : [];
    const index = currentProducts.findIndex((item) => this.sameId(item, expectedId || productId));
    if (expectedId && index < 0) throw new NotFoundException(expectedCatalogType === 'service' ? 'Servico nao encontrado.' : 'Produto nao encontrado.');
    if (expectedCatalogType && expectedId && !this.isCatalogType(currentProducts[index], expectedCatalogType)) throw new NotFoundException('Servico nao encontrado.');
    const products = expectedId
      ? currentProducts.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...product, id: expectedId } : item)
      : [...currentProducts, product];
    return this.forwardSave({ ...current.data, products }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de produtos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de produtos.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de produtos.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Product[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-product-${index + 1}`),
      ...(this.isService(item) ? { catalogType: 'service' } : {}),
      name: this.text(item.name ?? item.nome, 'Produto sem nome'),
      sku: this.text(item.sku),
      category: this.text(item.category),
      unit: this.text(item.unit ?? item.unidade, 'un'),
      price: this.number(item.price),
      active: item.active !== false,
    }));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private isCatalogType(value: unknown, expectedType: string): boolean {
    const item = this.record(value);
    return item !== null && (expectedType === (this.isService(item) ? 'service' : 'product'));
  }

  private isService(value: unknown): boolean {
    const item = this.record(value);
    if (!item) return false;
    return this.text(item.catalogType).toLowerCase() === 'service'
      || this.text(item.mode).toLowerCase() === 'servico'
      || ['h', 'mes', 'diaria', 'visita'].includes(this.text(item.unit ?? item.unidade).toLowerCase());
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
