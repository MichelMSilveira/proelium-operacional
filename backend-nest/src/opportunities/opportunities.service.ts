import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Opportunity = {
  id: string;
  company: string;
  contact: string;
  stage: string;
  owner: string;
  source: string;
  nextAction: string;
  nextDue: string;
  estimatedValue: number;
  [key: string]: unknown;
};

@Injectable()
export class OpportunitiesService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Opportunity[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de oportunidades.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar as oportunidades.');
    const payload = await upstream.json() as { data?: { opportunities?: unknown } };
    return this.normalizeList(payload.data?.opportunities);
  }

  private normalizeList(value: unknown): Opportunity[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item, index) => ({
        ...item,
        id: this.text(item.id, `legacy-opportunity-${index + 1}`),
        company: this.text(item.company), contact: this.text(item.contact),
        stage: this.text(item.stage, 'Novo contato'), owner: this.text(item.owner),
        source: this.text(item.source), nextAction: this.text(item.nextAction),
        nextDue: this.text(item.nextDue), estimatedValue: this.number(item.estimatedValue),
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
