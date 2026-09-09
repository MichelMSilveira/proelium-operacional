import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

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

  async list(cookie?: string): Promise<{ supportTickets: SupportTicket[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [tickets, state] = await Promise.all([
      this.pool.query(
        `select id, opened_at as "openedAt", client_id as "clientId", equipment_id as "equipmentId",
                type, priority, status, description, extra_data as "extraData"
         from support_tickets_domain_entries where company_id = $1 order by updated_at desc, opened_at desc`,
        [context.companyId],
      ),
      this.pool.query('select revision from support_tickets_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      supportTickets: tickets.rows.map((row) => this.ticketFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de chamado invalido.');
    const input = body as { supportTicket?: unknown; baseRevision?: unknown };
    const ticket = this.record(input.supportTicket);
    if (!ticket) throw new BadRequestException('Chamado invalido.');
    const clientId = this.text(ticket.clientId);
    const description = this.text(ticket.description);
    if (!clientId || !description) throw new BadRequestException('O chamado precisa conter cliente e descricao.');
    const ticketId = this.text(ticket.id) || `tic-${crypto.randomUUID()}`;
    if (expectedId && ticketId !== expectedId) throw new BadRequestException('O identificador do chamado nao confere.');
    const normalized = this.normalizeTicket(ticket, expectedId || ticketId);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from support_tickets_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Chamado nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um chamado com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(ticket),
      };
      await client.query(
        `insert into support_tickets_domain_entries
          (company_id, id, opened_at, client_id, equipment_id, type, priority, status, description, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
         on conflict (company_id, id) do update set
           opened_at = excluded.opened_at, client_id = excluded.client_id, equipment_id = excluded.equipment_id,
           type = excluded.type, priority = excluded.priority, status = excluded.status,
           description = excluded.description, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.openedAt, normalized.clientId, normalized.equipmentId,
          normalized.type, normalized.priority, normalized.status, normalized.description, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, supportTicket: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async authContext(cookie?: string): Promise<AuthContext> {
    if (!cookie) throw new UnauthorizedException('Sessao obrigatoria.');
    const upstream = await fetch(`${this.legacyOrigin}/api/auth/me`, { headers: { cookie } }).catch(() => {
      throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    });
    if (upstream.status === 401) throw new UnauthorizedException('Sessao expirada.');
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    const payload = await upstream.json() as { user?: RecordItem };
    const user = payload.user;
    if (!user) throw new UnauthorizedException('Sessao invalida.');
    const permissions = Array.isArray(user.permissions) ? user.permissions.map((item) => this.text(item)) : [];
    const modules = Array.isArray(user.modules) ? user.modules.map((item) => this.text(item)) : [];
    if (this.text(user.role) !== 'admin' && !permissions.includes('projects') && !permissions.includes('operations') && !modules.includes('projects') && !modules.includes('operations')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos chamados.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar chamados.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:support-tickets:${companyId}`]);
    const result = await client.query('select revision from support_tickets_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into support_tickets_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update support_tickets_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private ticketFromRow(row: RecordItem): SupportTicket {
    return this.normalizeTicket({ ...(this.record(row.extraData) || {}), id: row.id, openedAt: row.openedAt, clientId: row.clientId, equipmentId: row.equipmentId, type: row.type, priority: row.priority, status: row.status, description: row.description }, this.text(row.id));
  }

  private extraData(ticket: RecordItem): RecordItem {
    const { id, openedAt, clientId, equipmentId, type, priority, status, description, updatedAt, createdAt, ...extra } = ticket;
    void id; void openedAt; void clientId; void equipmentId; void type; void priority; void status; void description; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ supportTickets: SupportTicket[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura dos chamados');
    return { supportTickets: this.normalizeList(current.data.supportTickets), revision: current.revision };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de chamado invalido.');
    const input = body as { supportTicket?: unknown; baseRevision?: unknown };
    const ticket = this.record(input.supportTicket);
    if (!ticket) throw new BadRequestException('Chamado invalido.');
    const clientId = this.text(ticket.clientId);
    const description = this.text(ticket.description);
    if (!clientId || !description) throw new BadRequestException('O chamado precisa conter cliente e descricao.');
    const ticketId = this.text(ticket.id) || `tic-${crypto.randomUUID()}`;
    if (expectedId && ticketId !== expectedId) throw new BadRequestException('O identificador do chamado nao confere.');
    const current = await this.readAggregate(cookie, 'gravacao dos chamados');
    const tickets = Array.isArray(current.data.supportTickets) ? current.data.supportTickets : [];
    const index = tickets.findIndex((entry) => this.sameId(entry, expectedId || ticketId));
    if (expectedId && index < 0) throw new NotFoundException('Chamado nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um chamado com este identificador.');
    const normalized = this.normalizeTicket(ticket, expectedId || ticketId);
    const nextTickets = expectedId
      ? tickets.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...tickets];
    return this.forward({ ...current.data, supportTickets: nextTickets }, input.baseRevision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao dos chamados.');
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

  private record(value: unknown): RecordItem | null { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null; }
  private sameId(value: unknown, expectedId: string): boolean { const item = this.record(value); return item !== null && this.text(item.id) === expectedId; }
  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
