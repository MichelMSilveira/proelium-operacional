import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type ManufacturerEntry = { id: string; name: string; areas: string; source: string; status: string; [key: string]: unknown };

type Aggregate = { revision?: number; data?: Record<string, unknown> };

@Injectable()
export class ProductLibraryService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ entries: ManufacturerEntry[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura da biblioteca tecnica.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar a biblioteca tecnica.');
    const payload = await upstream.json() as Aggregate;
    return { entries: this.normalizeList(payload.data?.manufacturerLibrary), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de fabricante invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry || !String(entry.name || '').trim()) throw new BadRequestException('O fabricante precisa conter nome.');
    const entryId = String(entry.id || '');
    if (expectedId && (!entryId || entryId !== expectedId)) throw new BadRequestException('O identificador do fabricante nao confere.');
    const current = await this.readAggregate(cookie);
    const currentEntries = Array.isArray(current.data.manufacturerLibrary) ? current.data.manufacturerLibrary : [];
    const index = currentEntries.findIndex((item) => this.sameId(item, expectedId || entryId));
    if (expectedId && index < 0) throw new NotFoundException('Fabricante nao encontrado.');
    const normalized = {
      ...entry,
      id: entryId || `manufacturer-${Date.now()}`,
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
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura da biblioteca tecnica.');
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
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item, index) => ({
        ...item,
        id: this.text(item.id, `legacy-manufacturer-${index + 1}`),
        name: this.text(item.name, 'Fabricante sem nome'),
        areas: this.text(item.areas ?? item.category),
        source: this.text(item.source),
        status: this.text(item.status, 'Fonte oficial a consultar'),
      }));
  }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
