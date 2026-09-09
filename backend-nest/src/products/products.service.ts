import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type Product = { id: string; name: string; sku: string; category: string; unit: string; price: number; active: boolean; [key: string]: unknown };

type Aggregate = { revision?: number; data?: Record<string, unknown> };

@Injectable()
export class ProductsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ products: Product[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de produtos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os produtos.');
    const payload = await upstream.json() as Aggregate;
    return { products: this.normalizeList(payload.data?.products), revision: payload.revision };
  }

  async services(cookie?: string): Promise<{ services: Product[]; revision?: number }> {
    const resource = await this.list(cookie);
    const services = resource.products.filter((item) => item.catalogType === 'service' || item.mode === 'Servico' || ['h', 'mes', 'diaria', 'visita'].includes(item.unit.toLowerCase()));
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
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { product?: unknown; baseRevision?: unknown };
    const product = this.record(input.product);
    if (!product) throw new BadRequestException('A gravacao precisa conter um produto valido.');
    const productId = String(product.id || '');
    if (!productId) throw new BadRequestException('O produto precisa conter identificador.');
    if (expectedId && productId !== expectedId) throw new BadRequestException('O identificador do produto nao confere.');

    const current = await this.readAggregate(cookie);
    const currentProducts = Array.isArray(current.data.products) ? current.data.products : [];
    const index = currentProducts.findIndex((item) => this.sameId(item, expectedId || productId));
    if (expectedId && index < 0) throw new NotFoundException('Produto nao encontrado.');
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
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-product-${index + 1}`), name: this.text(item.name, 'Produto sem nome'),
      sku: this.text(item.sku), category: this.text(item.category), unit: this.text(item.unit, 'un'),
      price: this.number(item.price), active: item.active !== false,
    }));
  }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private isCatalogType(value: unknown, expectedType: string): boolean {
    const item = this.record(value);
    return item !== null && (item.catalogType === expectedType || item.mode === 'Servico' || ['h', 'mes', 'diaria', 'visita'].includes(this.text(item.unit).toLowerCase()));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
