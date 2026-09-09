import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type ExecutionEntry = {
  id: string;
  projectId: string;
  kind: string;
  date: string;
  person: string;
  quantity: string;
  amount: number;
  description: string;
  financialEntryId: string;
  [key: string]: unknown;
};

const kinds = ['Mão de obra', 'Material de execução', 'Transporte e logística', 'Serviço terceirizado', 'Outros gastos'];
const categories: Record<string, string> = {
  'Mão de obra': 'Mão de obra',
  'Material de execução': 'Materiais',
  'Transporte e logística': 'Logística',
  'Serviço terceirizado': 'Serviços terceirizados',
  'Outros gastos': 'Outros',
};

@Injectable()
export class ExecutionService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ entries: ExecutionEntry[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura da execucao');
    return { entries: this.normalizeList(current.data.executionEntries), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de lancamento de execucao invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry) throw new BadRequestException('Lancamento de execucao invalido.');
    const projectId = this.text(entry.projectId);
    const date = this.text(entry.date);
    const description = this.text(entry.description);
    const amount = this.number(entry.amount);
    if (!projectId || !date || !description) throw new BadRequestException('O lancamento precisa conter projeto, data e descricao.');
    if (amount < 0) throw new BadRequestException('O valor do lancamento nao pode ser negativo.');
    const entryId = this.text(entry.id) || `exec-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do lancamento nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao da execucao');
    const projects = Array.isArray(current.data.projects) ? current.data.projects : [];
    if (!projects.some((item) => this.sameId(item, projectId))) throw new NotFoundException('Projeto nao encontrado.');
    const entries = Array.isArray(current.data.executionEntries) ? current.data.executionEntries : [];
    const index = entries.findIndex((item) => this.sameId(item, expectedId || entryId));
    if (expectedId && index < 0) throw new NotFoundException('Lancamento de execucao nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um lancamento com este identificador.');
    const kind = kinds.includes(this.text(entry.kind)) ? this.text(entry.kind) : 'Outros gastos';
    const existing = index >= 0 ? this.record(entries[index]) : null;
    const financialEntryId = this.text(entry.financialEntryId, this.text(existing?.financialEntryId, `fin-exec-${crypto.randomUUID()}`));
    const normalized: ExecutionEntry = {
      ...entry,
      id: expectedId || entryId,
      projectId,
      kind,
      date,
      person: this.text(entry.person),
      quantity: this.text(entry.quantity),
      amount,
      description,
      financialEntryId,
    };
    const nextEntries = expectedId
      ? entries.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [normalized, ...entries];
    const project = projects.find((item) => this.sameId(item, projectId));
    const projectRecord = this.record(project);
    const financialEntries = Array.isArray(current.data.financialEntries) ? current.data.financialEntries : [];
    const financial = {
      id: financialEntryId,
      type: 'Despesa',
      status: 'Realizado',
      amount,
      date,
      category: categories[kind],
      responsible: normalized.person,
      clientId: this.text(projectRecord?.clientId),
      projectId,
      description: `[Execução] ${description}`,
    };
    const financialIndex = financialEntries.findIndex((item) => this.sameId(item, financialEntryId));
    const nextFinancialEntries = financialIndex >= 0
      ? financialEntries.map((item, itemIndex) => itemIndex === financialIndex ? { ...this.record(item), ...financial } : item)
      : [financial, ...financialEntries];
    return this.forward({ ...current.data, executionEntries: nextEntries, financialEntries: nextFinancialEntries }, input.baseRevision, cookie);
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
      body: JSON.stringify({ data, baseRevision, resource: 'execution' }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao da execucao.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): ExecutionEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-execution-${index + 1}`),
      projectId: this.text(item.projectId),
      kind: kinds.includes(this.text(item.kind)) ? this.text(item.kind) : 'Outros gastos',
      date: this.text(item.date),
      person: this.text(item.person),
      quantity: this.text(item.quantity),
      amount: this.number(item.amount),
      description: this.text(item.description, 'Lancamento sem descricao'),
      financialEntryId: this.text(item.financialEntryId),
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
