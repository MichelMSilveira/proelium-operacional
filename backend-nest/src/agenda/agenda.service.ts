import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Appointment = { id: string; title: string; clientId: string; projectId: string; assignee: string; date: string; time: string; note: string; status: string; [key: string]: unknown };

@Injectable()
export class AgendaService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);
  private readonly pool?: Pool;

  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PGPOOL_MAX || 10),
        connectionTimeoutMillis: 5000,
      });
    }
  }

  async list(cookie?: string): Promise<{ appointments: Appointment[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [appointments, state] = await Promise.all([
        this.pool.query(
          `select id, title, client_id as "clientId", project_id as "projectId", assignee, appointment_date as date,
                  appointment_time as time, note, status, extra_data as "extraData"
           from appointments_domain_entries where company_id = $1 order by appointment_date asc, appointment_time asc, updated_at desc`,
          [context.companyId],
        ),
        this.pool.query('select revision from appointments_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        appointments: appointments.rows.map((row) => this.appointmentFromRow(row)),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const current = await this.readAggregate(cookie, 'leitura da agenda');
    return { appointments: this.normalizeList(current.data.appointments), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
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
    if (this.pool) return this.databaseRemove(id, cookie);
    const current = await this.readAggregate(cookie, 'gravacao da agenda');
    const appointments = Array.isArray(current.data.appointments) ? current.data.appointments : [];
    if (!appointments.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Compromisso nao encontrado.');
    return this.forward({ ...current.data, appointments: appointments.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
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
    const normalized = this.normalize(appointment, expectedId || appointmentId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from appointments_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Compromisso nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um compromisso com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(appointment) };
      await client.query(
        `insert into appointments_domain_entries
          (company_id, id, title, client_id, project_id, assignee, appointment_date, appointment_time, note, status, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
         on conflict (company_id, id) do update set
           title = excluded.title, client_id = excluded.client_id, project_id = excluded.project_id,
           assignee = excluded.assignee, appointment_date = excluded.appointment_date,
           appointment_time = excluded.appointment_time, note = excluded.note, status = excluded.status,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.title, normalized.clientId, normalized.projectId,
          normalized.assignee, normalized.date, normalized.time, normalized.note, normalized.status, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, appointment: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseRemove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      const deleted = await client.query(
        'delete from appointments_domain_entries where company_id = $1 and id = $2 returning id',
        [context.companyId, id.trim()],
      );
      if (!deleted.rowCount) throw new NotFoundException('Compromisso nao encontrado.');
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, previousRevision: currentRevision }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async authContext(cookie?: string): Promise<AuthContext> {
    if (!cookie) throw new UnauthorizedException('Sessao obrigatoria.');
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: { cookie } }).catch(() => {
      throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    });
    if (upstream.status === 401) throw new UnauthorizedException('Sessao expirada.');
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    const payload = await upstream.json() as { user?: RecordItem };
    const user = payload.user;
    if (!user) throw new UnauthorizedException('Sessao invalida.');
    const permissions = Array.isArray(user.permissions) ? user.permissions.map((item) => this.text(item)) : [];
    const modules = Array.isArray(user.modules) ? user.modules.map((item) => this.text(item)) : [];
    if (this.text(user.role) !== 'admin' && !permissions.includes('agenda') && !modules.includes('agenda')) {
      throw new ForbiddenException('Seu perfil nao possui acesso a agenda.');
    }
    return {
      username: this.text(user.username, 'unknown'),
      companyId: this.text(user.companyId, 'legacy') || 'legacy',
      role: this.text(user.role, 'leitura'),
      permissions,
      modules,
    };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao') {
      throw new ForbiddenException('Seu perfil nao pode alterar a agenda.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:agenda:${companyId}`]);
    const result = await client.query('select revision from appointments_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into appointments_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update appointments_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private appointmentFromRow(row: RecordItem): Appointment {
    return this.normalize({ ...(this.record(row.extraData) || {}), id: row.id, title: row.title, clientId: row.clientId, projectId: row.projectId, assignee: row.assignee, date: row.date, time: row.time, note: row.note, status: row.status }, this.text(row.id));
  }

  private extraData(appointment: RecordItem): RecordItem {
    const { id, title, clientId, projectId, assignee, person, date, time, note, status, updatedAt, createdAt, ...extra } = appointment;
    void id; void title; void clientId; void projectId; void assignee; void person; void date; void time; void note; void status; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
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
