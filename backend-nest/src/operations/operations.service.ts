import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

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

  async list(cookie?: string): Promise<{ serviceOrders: ServiceOrder[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [orders, state] = await Promise.all([
        this.pool.query(
          `select id, code, client_id as "clientId", project_id as "projectId", equipment_id as "equipmentId", type,
                  order_date as date, order_time as time, assignee, status, description, extra_data as "extraData"
           from service_orders_domain_entries where company_id = $1 order by order_date desc, updated_at desc`,
          [context.companyId],
        ),
        this.pool.query('select revision from service_orders_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        serviceOrders: orders.rows.map((row) => this.orderFromRow(row)),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const current = await this.readAggregate(cookie, 'leitura das ordens de servico');
    return { serviceOrders: this.normalizeList(current.data.serviceOrders), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
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
    if (this.pool) return this.databaseRemove(id, cookie);
    const current = await this.readAggregate(cookie, 'gravacao de ordens de servico');
    const orders = Array.isArray(current.data.serviceOrders) ? current.data.serviceOrders : [];
    if (!orders.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Ordem de servico nao encontrada.');
    const reports = Array.isArray(current.data.serviceReports) ? current.data.serviceReports : [];
    if (reports.some((entry) => this.record(entry)?.serviceOrderId === id)) {
      throw new BadRequestException('A ordem possui relatorios vinculados e nao pode ser excluida.');
    }
    return this.forward({ ...current.data, serviceOrders: orders.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ordem de servico invalido.');
    const input = body as { serviceOrder?: unknown; baseRevision?: unknown };
    const order = this.record(input.serviceOrder);
    if (!order) throw new BadRequestException('Ordem de servico invalida.');
    const clientId = this.text(order.clientId);
    const description = this.text(order.description);
    if (!clientId || !description) throw new BadRequestException('A ordem precisa conter cliente e descricao.');
    const orderId = this.text(order.id) || `os-${crypto.randomUUID()}`;
    if (expectedId && orderId !== expectedId) throw new BadRequestException('O identificador da ordem nao confere.');
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from service_orders_domain_entries where company_id = $1 and id = $2',
        [context.companyId, expectedId || orderId],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Ordem de servico nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma ordem com este identificador.');
      const count = await client.query('select count(*)::int as total from service_orders_domain_entries where company_id = $1', [context.companyId]);
      const normalized = this.normalize(order, expectedId || orderId, `OS-${String(Number(count.rows[0].total) + 1001).padStart(4, '0')}`);
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(order) };
      await client.query(
        `insert into service_orders_domain_entries
          (company_id, id, code, client_id, project_id, equipment_id, type, order_date, order_time, assignee, status, description, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
         on conflict (company_id, id) do update set
           code = excluded.code, client_id = excluded.client_id, project_id = excluded.project_id,
           equipment_id = excluded.equipment_id, type = excluded.type, order_date = excluded.order_date,
           order_time = excluded.order_time, assignee = excluded.assignee, status = excluded.status,
           description = excluded.description, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.code, normalized.clientId, normalized.projectId, normalized.equipmentId,
          normalized.type, normalized.date, normalized.time, normalized.assignee, normalized.status, normalized.description, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, serviceOrder: normalized }) };
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
    const current = await this.readAggregate(cookie, 'validacao de vinculos da ordem de servico');
    const reports = Array.isArray(current.data.serviceReports) ? current.data.serviceReports : [];
    if (reports.some((entry) => this.record(entry)?.serviceOrderId === id)) {
      throw new BadRequestException('A ordem possui relatorios vinculados e nao pode ser excluida.');
    }
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      const deleted = await client.query(
        'delete from service_orders_domain_entries where company_id = $1 and id = $2 returning id',
        [context.companyId, id.trim()],
      );
      if (!deleted.rowCount) throw new NotFoundException('Ordem de servico nao encontrada.');
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('operations') && !modules.includes('operations')) {
      throw new ForbiddenException('Seu perfil nao possui acesso as ordens de servico.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar ordens de servico.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:operations:${companyId}`]);
    const result = await client.query('select revision from service_orders_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into service_orders_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update service_orders_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private orderFromRow(row: RecordItem): ServiceOrder {
    return this.normalize({ ...(this.record(row.extraData) || {}), id: row.id, code: row.code, clientId: row.clientId, projectId: row.projectId, equipmentId: row.equipmentId, type: row.type, date: row.date, time: row.time, assignee: row.assignee, status: row.status, description: row.description }, this.text(row.id), this.text(row.code));
  }

  private normalize(item: RecordItem, id: string, fallbackCode: string): ServiceOrder {
    return {
      ...item,
      id,
      code: this.text(item.code, fallbackCode),
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      equipmentId: this.text(item.equipmentId),
      type: types.includes(this.text(item.type)) ? this.text(item.type) : 'Visita técnica',
      date: this.text(item.date, new Date().toISOString().slice(0, 10)),
      time: this.text(item.time),
      assignee: this.text(item.assignee ?? item.responsible),
      status: statuses.includes(this.text(item.status)) ? this.text(item.status) : 'Agendada',
      description: this.text(item.description, 'Escopo nao informado'),
    };
  }

  private extraData(order: RecordItem): RecordItem {
    const { id, code, clientId, projectId, equipmentId, type, date, time, assignee, responsible, status, description, updatedAt, createdAt, ...extra } = order;
    void id; void code; void clientId; void projectId; void equipmentId; void type; void date; void time; void assignee; void responsible; void status; void description; void updatedAt; void createdAt;
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
