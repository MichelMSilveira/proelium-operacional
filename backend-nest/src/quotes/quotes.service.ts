import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Quote = { id: string; opportunityId: string; clientId: string; title: string; status: string; value: number; [key: string]: unknown };

@Injectable()
export class QuotesService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Quote[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de orçamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os orçamentos.');
    const payload = await upstream.json() as { data?: { quotes?: unknown } };
    return this.normalizeList(payload.data?.quotes);
  }

  async save(body: unknown, cookie?: string): Promise<unknown> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravação inválido.');
    const input = body as { data?: { quotes?: unknown }; baseRevision?: unknown };
    if (!input.data || typeof input.data !== 'object' || !Array.isArray(input.data.quotes)) {
      throw new BadRequestException('A gravação precisa conter data.quotes como lista.');
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data: input.data, baseRevision: input.baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para gravação de orçamentos.');
    });
    const result = await upstream.text();
    return { status: upstream.status, body: result };
  }

  private normalizeList(value: unknown): Quote[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-quote-${index + 1}`), opportunityId: this.text(item.opportunityId),
      clientId: this.text(item.clientId), title: this.text(item.title, 'Orçamento sem título'),
      status: this.text(item.status, 'Em elaboração'), value: this.number(item.value),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
