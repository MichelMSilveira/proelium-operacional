import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

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

type Aggregate = { revision?: number; data?: Record<string, unknown> };

@Injectable()
export class OpportunitiesService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ opportunities: Opportunity[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de oportunidades.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar as oportunidades.');
    const payload = await upstream.json() as Aggregate;
    return { opportunities: this.normalizeList(payload.data?.opportunities), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { opportunity?: unknown; baseRevision?: unknown };
    const opportunity = this.record(input.opportunity);
    if (!opportunity) throw new BadRequestException('A gravacao precisa conter uma oportunidade valida.');
    const opportunityId = String(opportunity.id || '');
    if (!opportunityId) throw new BadRequestException('A oportunidade precisa conter identificador.');
    if (expectedId && opportunityId !== expectedId) throw new BadRequestException('O identificador da oportunidade nao confere.');

    const current = await this.readAggregate(cookie);
    const currentOpportunities = Array.isArray(current.data.opportunities) ? current.data.opportunities : [];
    const index = currentOpportunities.findIndex((item) => this.sameId(item, expectedId || opportunityId));
    if (expectedId && index < 0) throw new NotFoundException('Oportunidade nao encontrada.');
    const opportunities = expectedId
      ? currentOpportunities.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...opportunity, id: expectedId } : item)
      : [...currentOpportunities, opportunity];
    return this.forwardSave({ ...current.data, opportunities }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de oportunidades.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de oportunidades.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de oportunidades.');
    });
    return { status: upstream.status, body: await upstream.text() };
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

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
