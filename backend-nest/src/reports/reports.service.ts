import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type ServiceReport = { id: string; projectId: string; serviceOrderId: string; appointmentId: string; type: string; technician: string; responsible: string; date: string; status: string; execution: string; tests: string; pending: string; nextActionDate: string; media: string; [key: string]: unknown };
export type ProjectDelivery = { id: string; projectId: string; status: string; date: string; [key: string]: unknown };

@Injectable()
export class ReportsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ serviceReports: ServiceReport[]; projectDeliveries: ProjectDelivery[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura de relatorios');
    return {
      serviceReports: this.normalizeReports(current.data.serviceReports),
      projectDeliveries: this.normalizeDeliveries(current.data.projectDeliveries),
      revision: current.revision,
    };
  }

  async save(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de relatorio invalido.');
    const input = body as { serviceReport?: unknown; baseRevision?: unknown };
    const report = this.record(input.serviceReport);
    if (!report) throw new BadRequestException('Relatorio invalido.');
    const projectId = this.text(report.projectId);
    const technician = this.text(report.technician ?? report.responsible);
    const date = this.text(report.date);
    const execution = this.text(report.execution);
    if (!projectId || !technician || !date || !execution) throw new BadRequestException('O relatorio precisa conter projeto, data, responsavel e execucao.');
    const reportId = this.text(report.id) || `rpt-${crypto.randomUUID()}`;

    const current = await this.readAggregate(cookie, 'gravacao de relatorios');
    const reports = Array.isArray(current.data.serviceReports) ? current.data.serviceReports : [];
    if (reports.some((entry) => this.sameId(entry, reportId))) throw new BadRequestException('Ja existe um relatorio com este identificador.');
    const normalized = this.normalizeReport(report, reportId);
    const nextData: Record<string, unknown> = { ...current.data, serviceReports: [normalized, ...reports] };
    const serviceOrderId = this.text(report.serviceOrderId);
    const serviceOrders = Array.isArray(current.data.serviceOrders) ? current.data.serviceOrders.filter((entry): entry is RecordItem => Boolean(entry) && typeof entry === 'object') : [];
    if (serviceOrderId && normalized.status === 'Concluído' && serviceOrders.length) {
      nextData.serviceOrders = serviceOrders.map((entry) => this.sameId(entry, serviceOrderId) ? { ...entry, status: 'Concluída' } : entry);
    }
    const appointmentId = this.text(report.appointmentId);
    const appointments = Array.isArray(current.data.appointments) ? current.data.appointments.filter((entry): entry is RecordItem => Boolean(entry) && typeof entry === 'object') : [];
    if (appointmentId && appointments.length) {
      nextData.appointments = appointments.map((entry) => this.sameId(entry, appointmentId) ? { ...entry, reportId, reportStatus: normalized.status, reportedAt: new Date().toISOString() } : entry);
    }
    return this.forward(nextData, input.baseRevision, cookie);
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
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de relatorios.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeReports(value: unknown): ServiceReport[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeReport(item, this.text(item.id, `legacy-report-${index + 1}`)));
  }

  private normalizeReport(item: RecordItem, id: string): ServiceReport {
    const technician = this.text(item.technician ?? item.responsible);
    return {
      ...item,
      id,
      projectId: this.text(item.projectId),
      serviceOrderId: this.text(item.serviceOrderId),
      appointmentId: this.text(item.appointmentId),
      type: this.text(item.type, 'Relatorio de servico'),
      technician,
      responsible: technician,
      date: this.text(item.date),
      status: this.text(item.status, 'Pendente'),
      execution: this.text(item.execution),
      tests: this.text(item.tests),
      pending: this.text(item.pending),
      nextActionDate: this.text(item.nextActionDate),
      media: this.text(item.media, '[]'),
    };
  }

  private normalizeDeliveries(value: unknown): ProjectDelivery[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-delivery-${index + 1}`),
      projectId: this.text(item.projectId),
      status: this.text(item.status, 'Pendente'),
      date: this.text(item.date ?? item.deliveredAt ?? item.acceptedAt),
    }));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
