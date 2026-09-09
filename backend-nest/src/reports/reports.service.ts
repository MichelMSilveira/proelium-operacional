import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { RoutinesService } from '../routines/routines.service';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type ServiceReport = { id: string; projectId: string; serviceOrderId: string; appointmentId: string; type: string; technician: string; responsible: string; date: string; status: string; execution: string; tests: string; pending: string; nextActionDate: string; media: string; [key: string]: unknown };
export type ProjectDelivery = { id: string; projectId: string; status: string; date: string; [key: string]: unknown };

@Injectable()
export class ReportsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);
  private readonly pool?: Pool;

  constructor(private readonly routines: RoutinesService) {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PGPOOL_MAX || 10),
        connectionTimeoutMillis: 5000,
      });
    }
  }

  async list(cookie?: string): Promise<{ serviceReports: ServiceReport[]; projectDeliveries: ProjectDelivery[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [reports, deliveries, state] = await Promise.all([
        this.pool.query(
          `select id, project_id as "projectId", service_order_id as "serviceOrderId", appointment_id as "appointmentId",
                  type, technician, responsible, report_date as date, status, execution, tests, pending,
                  next_action_date as "nextActionDate", media, extra_data as "extraData"
           from reports_domain_service_entries where company_id = $1 order by report_date desc, updated_at desc`,
          [context.companyId],
        ),
        this.pool.query(
          `select id, project_id as "projectId", status, delivery_date as date, responsible, acceptance, note, extra_data as "extraData"
           from reports_domain_delivery_entries where company_id = $1 order by delivery_date desc, updated_at desc`,
          [context.companyId],
        ),
        this.pool.query('select revision from reports_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        serviceReports: reports.rows.map((row) => this.reportFromRow(row)),
        projectDeliveries: deliveries.rows.map((row) => this.deliveryFromRow(row)),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const current = await this.readAggregate(cookie, 'leitura de relatorios');
    return {
      serviceReports: this.normalizeReports(current.data.serviceReports),
      projectDeliveries: this.normalizeDeliveries(current.data.projectDeliveries),
      revision: current.revision,
    };
  }

  async save(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie);
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
    if (this.pool) return this.databaseSaveDelivery(body, cookie);
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

  private async databaseSave(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
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
    const normalized = this.normalizeReport(report, reportId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query('select id from reports_domain_service_entries where company_id = $1 and id = $2', [context.companyId, reportId]);
      if (existing.rowCount) throw new BadRequestException('Ja existe um relatorio com este identificador.');
      const extraData = this.extraData(report, 'serviceReport');
      await client.query(
        `insert into reports_domain_service_entries
          (company_id, id, project_id, service_order_id, appointment_id, type, technician, responsible, report_date, status,
           execution, tests, pending, next_action_date, media, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, now())`,
        [context.companyId, normalized.id, normalized.projectId, normalized.serviceOrderId, normalized.appointmentId, normalized.type,
          normalized.technician, normalized.responsible, normalized.date, normalized.status, normalized.execution, normalized.tests,
          normalized.pending, normalized.nextActionDate, normalized.media, JSON.stringify(extraData)],
      );
      if (normalized.serviceOrderId && normalized.status === 'Concluído') {
        await client.query(
          'update service_orders_domain_entries set status = $1, updated_at = now() where company_id = $2 and id = $3',
          ['Concluída', context.companyId, normalized.serviceOrderId],
        );
      }
      if (normalized.appointmentId) {
        await client.query(
          `update appointments_domain_entries
           set extra_data = extra_data || $1::jsonb, updated_at = now()
           where company_id = $2 and id = $3`,
          [JSON.stringify({ reportId: normalized.id, reportStatus: normalized.status, reportedAt: new Date().toISOString() }), context.companyId, normalized.appointmentId],
        );
      }
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 201, body: JSON.stringify({ ok: true, revision: nextRevision, serviceReport: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseSaveDelivery(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
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
    const directProject = await this.pool!.query(
      `select id, name, client_id as "clientId" from projects_domain_entries where company_id = $1 and id = $2`,
      [context.companyId, projectId],
    );
    const project = directProject.rows[0];
    if (!project) throw new NotFoundException('Projeto nao encontrado.');
    const checklistPayload = await this.routines.listChecklists(cookie);
    const projectChecklist = checklistPayload.projectChecklists.filter((item) => this.text(item.projectId) === projectId);
    if (!projectChecklist.length) throw new BadRequestException('Aplique o checklist do projeto antes de registrar a entrega.');
    if (projectChecklist.some((item) => item.done !== true)) throw new BadRequestException('Conclua todos os itens do checklist antes de registrar a entrega.');
    const normalized = {
      ...delivery,
      id: this.text(delivery.id, `del-${crypto.randomUUID()}`),
      projectId,
      status: acceptance,
      date,
      responsible,
      acceptance,
      note,
    };
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const extraData = this.extraData(delivery, 'projectDelivery');
      await client.query(
        `insert into reports_domain_delivery_entries
          (company_id, id, project_id, status, delivery_date, responsible, acceptance, note, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
         on conflict (company_id, project_id) do update set
           id = excluded.id, status = excluded.status, delivery_date = excluded.delivery_date,
           responsible = excluded.responsible, acceptance = excluded.acceptance, note = excluded.note,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.projectId, normalized.status, normalized.date, normalized.responsible,
          normalized.acceptance, normalized.note, JSON.stringify(extraData)],
      );
      await client.query(
        `update installations_domain_entries
         set stage = 'Entrega', progress = 100, status = $1, due = $2, updated_at = now()
         where company_id = $3 and project_id = $4`,
        [acceptance === 'Aceite confirmado' ? 'Concluído' : 'Aguardando aceite', date, context.companyId, projectId],
      );
      await client.query(
        `update projects_domain_entries
         set technical_stage = 'Entrega', progress = 100, status = $1, updated_at = now()
         where company_id = $2 and id = $3`,
        [acceptance === 'Aceite confirmado' ? 'Concluído' : 'Aguardando aceite', context.companyId, projectId],
      );
      await client.query(
        `insert into projects_domain_state (company_id, revision) values ($1, 1)
         on conflict (company_id) do update set revision = projects_domain_state.revision + 1, updated_at = now()`,
        [context.companyId],
      );
      await client.query(
        `insert into installations_domain_state (company_id, revision) values ($1, 1)
         on conflict (company_id) do update set revision = installations_domain_state.revision + 1, updated_at = now()`,
        [context.companyId],
      );
      const projectRecord = this.record(project);
      const clientId = this.text(projectRecord?.clientId);
      const activity = clientId ? {
        id: `act-${crypto.randomUUID()}`,
        clientId,
        type: 'Entrega',
        title: `Entrega do projeto ${this.text(projectRecord?.name, projectId)}`,
        note,
        date,
      } : null;
      if (activity) await this.appendClientActivity(client, context.companyId, activity);
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 201, body: JSON.stringify({ ok: true, revision: nextRevision, projectDelivery: normalized }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('reports') && !modules.includes('reports')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos relatorios.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: this.text(user.role, 'leitura'), permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao') throw new ForbiddenException('Seu perfil nao pode alterar relatorios.');
  }

  private async appendClientActivity(client: PoolClient, companyId: string, activity: RecordItem): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:clients:${companyId}`]);
    await client.query(
      `insert into clients_domain_activities
        (company_id, id, client_id, activity_date, type, title, note, extra_data, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, now())
       on conflict (company_id, id) do nothing`,
      [companyId, activity.id, activity.clientId, activity.date, activity.type, activity.title, activity.note],
    );
    await client.query(
      `insert into clients_domain_state (company_id, revision) values ($1, 0)
       on conflict (company_id) do update set revision = clients_domain_state.revision + 1, updated_at = now()`,
      [companyId],
    );
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:reports:${companyId}`]);
    const result = await client.query('select revision from reports_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into reports_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update reports_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private reportFromRow(row: RecordItem): ServiceReport {
    return this.normalizeReport({ ...(this.record(row.extraData) || {}), id: row.id, projectId: row.projectId, serviceOrderId: row.serviceOrderId, appointmentId: row.appointmentId, type: row.type, technician: row.technician, responsible: row.responsible, date: row.date, status: row.status, execution: row.execution, tests: row.tests, pending: row.pending, nextActionDate: row.nextActionDate, media: row.media }, this.text(row.id));
  }

  private deliveryFromRow(row: RecordItem): ProjectDelivery {
    return { ...(this.record(row.extraData) || {}), id: this.text(row.id), projectId: this.text(row.projectId), status: this.text(row.status), date: this.text(row.date), responsible: this.text(row.responsible), acceptance: this.text(row.acceptance), note: this.text(row.note) };
  }

  private extraData(item: RecordItem, kind: 'serviceReport' | 'projectDelivery'): RecordItem {
    if (kind === 'serviceReport') {
      const { id, projectId, serviceOrderId, appointmentId, type, technician, responsible, date, status, execution, tests, pending, nextActionDate, media, updatedAt, createdAt, ...extra } = item;
      void id; void projectId; void serviceOrderId; void appointmentId; void type; void technician; void responsible; void date; void status; void execution; void tests; void pending; void nextActionDate; void media; void updatedAt; void createdAt;
      return extra;
    }
    const { id, projectId, status, date, responsible, acceptance, note, updatedAt, createdAt, ...extra } = item;
    void id; void projectId; void status; void date; void responsible; void acceptance; void note; void updatedAt; void createdAt;
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
