import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type Appointment = { id: string; title: string; clientId: string; projectId: string; assignee: string; date: string; time: string; note: string; status: string; [key: string]: unknown };

@Injectable()
export class AgendaService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ appointments: Appointment[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura da agenda');
    return { appointments: this.normalizeList(current.data.appointments), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de compromisso invalido.');
    const input = body as { appointment?: unknown; baseRevision?: unknown };
    const appointment = this.record(input.appointment);
    if (!appointment) throw new BadRequestException('Compromisso invalido.');
    const title = this.text(appointment.title);
    const assignee = this.text(appointment.assignee ?? appointment.person);
    const date = this.text(appointment.date);
    if (!title || !assignee || !date) throw new BadRequestException('O compromisso precisa conter titulo, responsavel e data.');
    const appointmentId = this.text(appointment.id) || `apt-${crypto.randomUUID()}`;
    if (expectedId && appointmentId !== expectedId) throw new BadRequestException('O identificador do compromisso nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao da agenda');
    const appointments = Array.isArray(current.data.appointments) ? current.data.appointments : [];
    const index = appointments.findIndex((entry) => this.sameId(entry, expectedId || appointmentId));
    if (expectedId && index < 0) throw new NotFoundException('Compromisso nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um compromisso com este identificador.');
    const normalized = this.normalize(appointment, expectedId || appointmentId);
    const nextAppointments = expectedId
      ? appointments.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...appointments];
    return this.forward({ ...current.data, appointments: nextAppointments }, input.baseRevision, cookie);
  }

  async remove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador do compromisso e obrigatorio.');
    const current = await this.readAggregate(cookie, 'gravacao da agenda');
    const appointments = Array.isArray(current.data.appointments) ? current.data.appointments : [];
    if (!appointments.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Compromisso nao encontrado.');
    return this.forward({ ...current.data, appointments: appointments.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao da agenda.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Appointment[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalize(item, this.text(item.id, `legacy-appointment-${index + 1}`)));
  }

  private normalize(item: RecordItem, id: string): Appointment {
    const assignee = this.text(item.assignee ?? item.person);
    return {
      ...item,
      id,
      title: this.text(item.title, 'Compromisso sem titulo'),
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      assignee,
      person: assignee,
      date: this.text(item.date),
      time: this.text(item.time),
      note: this.text(item.note),
      status: this.text(item.status, 'Agendado'),
    };
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
