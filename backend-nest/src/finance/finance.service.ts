import { Injectable, ServiceUnavailableException } from '@nestjs/common';

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

  async list(cookie?: string): Promise<FinancialEntry[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do financeiro.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os lancamentos financeiros.');
    const payload = await upstream.json() as { data?: { financialEntries?: unknown } };
    return this.normalizeList(payload.data?.financialEntries);
  }

  private normalizeList(value: unknown): FinancialEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
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

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }

  private number(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : 0;
  }
}
