import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Product = { id: string; name: string; sku: string; category: string; unit: string; price: number; active: boolean; [key: string]: unknown };

@Injectable()
export class ProductsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Product[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de produtos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os produtos.');
    const payload = await upstream.json() as { data?: { products?: unknown } };
    return this.normalizeList(payload.data?.products);
  }

  private normalizeList(value: unknown): Product[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-product-${index + 1}`), name: this.text(item.name, 'Produto sem nome'),
      sku: this.text(item.sku), category: this.text(item.category), unit: this.text(item.unit, 'un'),
      price: this.number(item.price), active: item.active !== false,
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
