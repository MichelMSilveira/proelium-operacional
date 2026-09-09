import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type FinancialEntry = {
  id: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  responsible: string;
  clientId: string;
  projectId: string;
  accountId: string;
  [key: string]: unknown;
};

@Injectable()
export class FinanceService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ entries: FinancialEntry[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do financeiro.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os lancamentos financeiros.');
    const payload = await upstream.json() as AggregateResponse;
    return { entries: this.normalizeList(payload.data?.financialEntries), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de lancamento invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry || !this.text(entry.description ?? entry.name ?? entry.nome).trim()) throw new BadRequestException('O lancamento precisa conter descricao.');
    const entryId = this.text(entry.id) || `fin-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do lancamento nao confere.');
    const amount = this.number(entry.amount ?? entry.value ?? entry.valor);
    if (amount <= 0) throw new BadRequestException('O lancamento precisa conter valor maior que zero.');

    const current = await this.readAggregate(cookie);
    const entries = Array.isArray(current.data.financialEntries) ? current.data.financialEntries : [];
    const index = entries.findIndex((item) => this.sameId(item, expectedId || entryId));
    if (expectedId && index < 0) throw new NotFoundException('Lancamento financeiro nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um lancamento com este identificador.');
    const normalized = {
      ...entry,
      id: expectedId || entryId,
      type: this.text(entry.type, 'Despesa'),
      status: this.text(entry.status, 'Realizado'),
      amount,
      date: this.text(entry.date, new Date().toISOString().slice(0, 10)),
      category: this.text(entry.category ?? entry.categoria, 'Sem categoria'),
      description: this.text(entry.description ?? entry.name ?? entry.nome),
      responsible: this.text(entry.responsible),
      clientId: this.text(entry.clientId),
      projectId: this.text(entry.projectId),
      accountId: this.text(entry.accountId),
    };
    const nextEntries = expectedId
      ? entries.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [...entries, normalized];
    return this.forward({ ...current.data, financialEntries: nextEntries }, input.baseRevision, cookie);
  }

  async remove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador do lancamento e obrigatorio.');
    const current = await this.readAggregate(cookie);
    const entries = Array.isArray(current.data.financialEntries) ? current.data.financialEntries : [];
    if (!entries.some((item) => this.sameId(item, id))) throw new NotFoundException('Lancamento financeiro nao encontrado.');
    return this.forward({ ...current.data, financialEntries: entries.filter((item) => !this.sameId(item, id)) }, current.revision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<AggregateResponse & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do financeiro.');
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao financeira.');
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do financeiro.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): FinancialEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-financial-entry-${index + 1}`),
      type: this.text(item.type, 'Lancamento'),
      status: this.text(item.status, 'Realizado'),
      amount: this.number(item.amount ?? item.value ?? item.valor),
      date: this.text(item.date),
      category: this.text(item.category ?? item.categoria, 'Sem categoria'),
      description: this.text(item.description ?? item.name ?? item.nome, 'Lancamento sem descricao'),
      responsible: this.text(item.responsible),
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      accountId: this.text(item.accountId),
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
