import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type ServiceOrder = {
  id: string;
  code: string;
  clientId: string;
  projectId: string;
  equipmentId: string;
  type: string;
  date: string;
  time: string;
  assignee: string;
  status: string;
  description: string;
  [key: string]: unknown;
};

const types = ['Visita técnica', 'Instalação', 'Manutenção', 'Chamado', 'Troca', 'Retirada'];
const statuses = ['Agendada', 'Em execução', 'Concluída', 'Cancelada'];

@Injectable()
export class OperationsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ serviceOrders: ServiceOrder[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura das ordens de servico');
    return { serviceOrders: this.normalizeList(current.data.serviceOrders), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ordem de servico invalido.');
    const input = body as { serviceOrder?: unknown; baseRevision?: unknown };
    const order = this.record(input.serviceOrder);
    if (!order) throw new BadRequestException('Ordem de servico invalida.');
    const clientId = this.text(order.clientId);
    const description = this.text(order.description);
    if (!clientId || !description) throw new BadRequestException('A ordem precisa conter cliente e descricao.');
    const orderId = this.text(order.id) || `os-${crypto.randomUUID()}`;
    if (expectedId && orderId !== expectedId) throw new BadRequestException('O identificador da ordem nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de ordens de servico');
    const orders = Array.isArray(current.data.serviceOrders) ? current.data.serviceOrders : [];
    const index = orders.findIndex((entry) => this.sameId(entry, expectedId || orderId));
    if (expectedId && index < 0) throw new NotFoundException('Ordem de servico nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma ordem com este identificador.');
    const normalized = {
      ...order,
      id: expectedId || orderId,
      code: this.text(order.code, `OS-${String(orders.length + 1001).padStart(4, '0')}`),
      clientId,
      projectId: this.text(order.projectId),
      equipmentId: this.text(order.equipmentId),
      type: types.includes(this.text(order.type)) ? this.text(order.type) : 'Visita técnica',
      date: this.text(order.date, new Date().toISOString().slice(0, 10)),
      time: this.text(order.time),
      assignee: this.text(order.assignee ?? order.responsible),
      status: statuses.includes(this.text(order.status)) ? this.text(order.status) : 'Agendada',
      description,
    };
    const nextOrders = expectedId
      ? orders.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...orders];
    return this.forward({ ...current.data, serviceOrders: nextOrders }, input.baseRevision, cookie);
  }

  async remove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador da ordem e obrigatorio.');
    const current = await this.readAggregate(cookie, 'gravacao de ordens de servico');
    const orders = Array.isArray(current.data.serviceOrders) ? current.data.serviceOrders : [];
    if (!orders.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Ordem de servico nao encontrada.');
    const reports = Array.isArray(current.data.serviceReports) ? current.data.serviceReports : [];
    if (reports.some((entry) => this.record(entry)?.serviceOrderId === id)) {
      throw new BadRequestException('A ordem possui relatorios vinculados e nao pode ser excluida.');
    }
    return this.forward({ ...current.data, serviceOrders: orders.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de ordens de servico.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): ServiceOrder[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-service-order-${index + 1}`),
      code: this.text(item.code, `OS-${index + 1001}`),
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      equipmentId: this.text(item.equipmentId),
      type: this.text(item.type, 'Visita técnica'),
      date: this.text(item.date),
      time: this.text(item.time),
      assignee: this.text(item.assignee ?? item.responsible),
      status: this.text(item.status, 'Agendada'),
      description: this.text(item.description, 'Escopo nao informado'),
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
}
