import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type SupportTicket = {
  id: string;
  openedAt: string;
  clientId: string;
  equipmentId: string;
  type: string;
  priority: string;
  status: string;
  description: string;
  [key: string]: unknown;
};

const types = ['Manutenção preventiva', 'Manutenção corretiva', 'Dúvida técnica', 'Garantia', 'Troca / retirada'];
const priorities = ['Baixa', 'Média', 'Alta', 'Urgente'];
const statuses = ['Aberto', 'Em atendimento', 'Resolvido', 'Cancelado'];

@Injectable()
export class SupportTicketsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ supportTickets: SupportTicket[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura dos chamados');
    return { supportTickets: this.normalizeList(current.data.supportTickets), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de chamado inválido.');
    const input = body as { supportTicket?: unknown; baseRevision?: unknown };
    const ticket = this.record(input.supportTicket);
    if (!ticket) throw new BadRequestException('Chamado inválido.');
    const clientId = this.text(ticket.clientId);
    const description = this.text(ticket.description);
    if (!clientId || !description) throw new BadRequestException('O chamado precisa conter cliente e descrição.');
    const ticketId = this.text(ticket.id) || `tic-${crypto.randomUUID()}`;
    if (expectedId && ticketId !== expectedId) throw new BadRequestException('O identificador do chamado não confere.');

    const current = await this.readAggregate(cookie, 'gravação dos chamados');
    const tickets = Array.isArray(current.data.supportTickets) ? current.data.supportTickets : [];
    const index = tickets.findIndex((entry) => this.sameId(entry, expectedId || ticketId));
    if (expectedId && index < 0) throw new NotFoundException('Chamado não encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Já existe um chamado com este identificador.');
    const normalized = this.normalizeTicket(ticket, expectedId || ticketId);
    const nextTickets = expectedId
      ? tickets.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...tickets];
    return this.forward({ ...current.data, supportTickets: nextTickets }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie: string | undefined, action: string): Promise<AggregateResponse & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException(`Backend legado indisponível para ${action}.`);
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException(`Não foi possível concluir a ${action}.`);
    try {
      const payload = JSON.parse(body) as AggregateResponse;
      return { ...payload, data: payload.data && typeof payload.data === 'object' ? payload.data : {} };
    } catch {
      throw new ServiceUnavailableException('Resposta inválida do backend legado.');
    }
  }

  private async forward(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para gravação dos chamados.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): SupportTicket[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeTicket(item, this.text(item.id, `legacy-ticket-${index + 1}`)));
  }

  private normalizeTicket(item: RecordItem, id: string): SupportTicket {
    const type = this.text(item.type, 'Manutenção corretiva');
    const priority = this.text(item.priority, 'Média');
    const status = this.text(item.status, 'Aberto');
    return {
      ...item,
      id,
      openedAt: this.text(item.openedAt, new Date().toISOString().slice(0, 10)),
      clientId: this.text(item.clientId),
      equipmentId: this.text(item.equipmentId),
      type: types.includes(type) ? type : 'Manutenção corretiva',
      priority: priorities.includes(priority) ? priority : 'Média',
      status: statuses.includes(status) ? status : 'Aberto',
      description: this.text(item.description),
    };
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
