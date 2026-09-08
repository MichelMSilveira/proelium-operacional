import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type ServiceReport = { id: string; projectId: string; serviceOrderId: string; type: string; responsible: string; date: string; status: string; [key: string]: unknown };

@Injectable()
export class ReportsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<ServiceReport[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de relatórios.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os relatórios.');
    const payload = await upstream.json() as { data?: { serviceReports?: unknown } };
    return this.normalizeList(payload.data?.serviceReports);
  }

  private normalizeList(value: unknown): ServiceReport[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-report-${index + 1}`), projectId: this.text(item.projectId), serviceOrderId: this.text(item.serviceOrderId),
      type: this.text(item.type, 'Relatório de serviço'), responsible: this.text(item.responsible), date: this.text(item.date), status: this.text(item.status, 'Em elaboração'),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
