import { Injectable, ServiceUnavailableException } from '@nestjs/common';

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

@Injectable()
export class PurchasesService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<PurchaseItem[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de compras.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar a lista de compras.');
    const payload = await upstream.json() as { data?: { purchaseItems?: unknown } };
    return this.normalizeList(payload.data?.purchaseItems);
  }

  private normalizeList(value: unknown): PurchaseItem[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-purchase-${index + 1}`),
      projectId: this.text(item.projectId),
      sourceKey: this.text(item.sourceKey),
      room: this.text(item.room),
      productId: this.text(item.productId),
      name: this.text(item.name, 'Material sem nome'),
      qty: this.number(item.qty),
      unit: this.text(item.unit, 'un'),
      status: this.text(item.status, 'Planejado'),
      supplier: this.text(item.supplier),
      note: this.text(item.note),
    }));
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }

  private number(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : 0;
  }
}
