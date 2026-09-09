import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RoutinesService } from '../routines/routines.service';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type ServiceReport = { id: string; projectId: string; serviceOrderId: string; appointmentId: string; type: string; technician: string; responsible: string; date: string; status: string; execution: string; tests: string; pending: string; nextActionDate: string; media: string; [key: string]: unknown };
export type ProjectDelivery = { id: string; projectId: string; status: string; date: string; [key: string]: unknown };

@Injectable()
export class ReportsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  constructor(private readonly routines: RoutinesService) {}

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

  async saveDelivery(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de entrega invalido.');
    const input = body as { projectDelivery?: unknown; baseRevision?: unknown };
    const delivery = this.record(input.projectDelivery);
    if (!delivery) throw new BadRequestException('Entrega invalida.');
    const projectId = this.text(delivery.projectId);
    const date = this.text(delivery.date);
    const responsible = this.text(delivery.responsible);
    const acceptance = this.text(delivery.acceptance, 'Aceite pendente');
    const note = this.text(delivery.note);
    if (!projectId || !date || !responsible || !note) throw new BadRequestException('A entrega precisa conter projeto, data, responsavel e resumo.');
    if (!['Aceite confirmado', 'Aceite pendente'].includes(acceptance)) throw new BadRequestException('Aceite de entrega invalido.');

    const current = await this.readAggregate(cookie, 'gravacao de entregas');
    const projects = Array.isArray(current.data.projects) ? current.data.projects : [];
    const project = projects.find((item) => this.sameId(item, projectId));
    if (!project) throw new NotFoundException('Projeto nao encontrado.');
    const checklistPayload = await this.routines.listChecklists(cookie);
    const checklists = checklistPayload.projectChecklists;
    const projectChecklist = checklists.filter((item) => this.record(item)?.projectId === projectId);
    if (!projectChecklist.length) throw new BadRequestException('Aplique o checklist do projeto antes de registrar a entrega.');
    if (projectChecklist.some((item) => this.record(item)?.done !== true)) throw new BadRequestException('Conclua todos os itens do checklist antes de registrar a entrega.');

    const deliveries = Array.isArray(current.data.projectDeliveries) ? current.data.projectDeliveries : [];
    const normalized = {
      ...delivery,
      id: this.text(delivery.id, `del-${crypto.randomUUID()}`),
      projectId,
      date,
      responsible,
      acceptance,
      note,
    };
    const nextData: Record<string, unknown> = {
      ...current.data,
      projectDeliveries: [normalized, ...deliveries.filter((item) => this.record(item)?.projectId !== projectId)],
    };
    nextData.projects = projects.map((item) => this.sameId(item, projectId) ? {
      ...this.record(item), technicalStage: 'Entrega', progress: 100, status: acceptance === 'Aceite confirmado' ? 'Concluído' : 'Aguardando aceite',
    } : item);
    const installations = Array.isArray(current.data.installations) ? current.data.installations : [];
    nextData.installations = installations.map((item) => this.record(item)?.projectId === projectId ? {
      ...this.record(item), stage: 'Entrega', progress: 100, status: acceptance === 'Aceite confirmado' ? 'Concluído' : 'Aguardando aceite', due: date,
    } : item);
    const projectRecord = this.record(project);
    const clientId = this.text(projectRecord?.clientId);
    const activities = Array.isArray(current.data.activities) ? current.data.activities : [];
    nextData.activities = clientId ? [{ id: `act-${crypto.randomUUID()}`, clientId, type: 'Entrega', title: `Entrega do projeto ${this.text(projectRecord?.name, projectId)}`, note, date }, ...activities] : activities;
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
