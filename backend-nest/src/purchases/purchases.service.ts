import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

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

  async list(cookie?: string): Promise<{ purchases: PurchaseItem[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura de compras');
    return { purchases: this.normalizeList(current.data.purchaseItems), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
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
    const current = await this.readAggregate(cookie, 'gravacao de compras');
    const items = Array.isArray(current.data.purchaseItems) ? current.data.purchaseItems : [];
    if (!items.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Item de compra nao encontrado.');
    return this.forward({ ...current.data, purchaseItems: items.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
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
