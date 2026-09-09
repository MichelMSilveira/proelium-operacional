import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type ServiceReport = { id: string; projectId: string; serviceOrderId: string; type: string; responsible: string; date: string; status: string; [key: string]: unknown };
export type ProjectDelivery = { id: string; projectId: string; status: string; date: string; [key: string]: unknown };

@Injectable()
export class ReportsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ serviceReports: ServiceReport[]; projectDeliveries: ProjectDelivery[] }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de relatórios.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os relatórios.');
    const payload = await upstream.json() as { data?: { serviceReports?: unknown; projectDeliveries?: unknown } };
    return {
      serviceReports: this.normalizeReports(payload.data?.serviceReports),
      projectDeliveries: this.normalizeDeliveries(payload.data?.projectDeliveries),
    };
  }

  private normalizeReports(value: unknown): ServiceReport[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-report-${index + 1}`), projectId: this.text(item.projectId), serviceOrderId: this.text(item.serviceOrderId),
      type: this.text(item.type, 'Relatório de serviço'), responsible: this.text(item.responsible), date: this.text(item.date), status: this.text(item.status, 'Em elaboração'),
    }));
  }

  private normalizeDeliveries(value: unknown): ProjectDelivery[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-delivery-${index + 1}`),
      projectId: this.text(item.projectId),
      status: this.text(item.status, 'Pendente'),
      date: this.text(item.date ?? item.deliveredAt ?? item.acceptedAt),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
