import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type ServiceOrder = { id: string; clientId: string; projectId: string; type: string; site: string; lead: string; stage: string; progress: number; status: string; [key: string]: unknown };

@Injectable()
export class OperationsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<ServiceOrder[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura das ordens de serviço.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar as ordens de serviço.');
    const payload = await upstream.json() as { data?: { serviceOrders?: unknown } };
    return this.normalizeList(payload.data?.serviceOrders);
  }

  private normalizeList(value: unknown): ServiceOrder[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-service-order-${index + 1}`), clientId: this.text(item.clientId), projectId: this.text(item.projectId),
      type: this.text(item.type, 'Ordem de serviço'), site: this.text(item.site), lead: this.text(item.lead),
      stage: this.text(item.stage, 'Planejamento'), progress: this.percent(item.progress), status: this.text(item.status, 'Planejamento'),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private percent(value: unknown): number { const result = Number(value); return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : 0; }
}
