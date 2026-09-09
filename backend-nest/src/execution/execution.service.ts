import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { FinanceService } from '../finance/finance.service';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type ExecutionEntry = {
  id: string;
  projectId: string;
  kind: string;
  date: string;
  person: string;
  quantity: string;
  amount: number;
  description: string;
  financialEntryId: string;
  [key: string]: unknown;
};

const kinds = ['Mão de obra', 'Material de execução', 'Transporte e logística', 'Serviço terceirizado', 'Outros gastos'];
const categories: Record<string, string> = {
  'Mão de obra': 'Mão de obra',
  'Material de execução': 'Materiais',
  'Transporte e logística': 'Logística',
  'Serviço terceirizado': 'Serviços terceirizados',
  'Outros gastos': 'Outros',
};

@Injectable()
export class ExecutionService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);
  private readonly pool?: Pool;

  constructor(private readonly finance: FinanceService) {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PGPOOL_MAX || 10),
        connectionTimeoutMillis: 5000,
      });
    }
  }

  async list(cookie?: string): Promise<{ entries: ExecutionEntry[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [entries, state] = await Promise.all([
        this.pool.query(
          `select id, project_id as "projectId", kind, date, person, quantity, amount, description,
                  financial_entry_id as "financialEntryId", extra_data as "extraData"
           from execution_domain_entries where company_id = $1 order by date desc, updated_at desc, description asc`,
          [context.companyId],
        ),
        this.pool.query('select revision from execution_domain_state where company_id = $1', [context.companyId]),
      ]);
      return { entries: entries.rows.map((row) => this.entryFromRow(row)), revision: Number(state.rows[0]?.revision || 0) };
    }
    const current = await this.readAggregate(cookie, 'leitura da execucao');
    return { entries: this.normalizeList(current.data.executionEntries), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de lancamento de execucao invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry) throw new BadRequestException('Lancamento de execucao invalido.');
    const projectId = this.text(entry.projectId);
    const date = this.text(entry.date);
    const description = this.text(entry.description);
    const amount = this.number(entry.amount);
    if (!projectId || !date || !description) throw new BadRequestException('O lancamento precisa conter projeto, data e descricao.');
    if (amount < 0) throw new BadRequestException('O valor do lancamento nao pode ser negativo.');
    const entryId = this.text(entry.id) || `exec-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do lancamento nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao da execucao');
    const projects = Array.isArray(current.data.projects) ? current.data.projects : [];
    if (!projects.some((item) => this.sameId(item, projectId))) throw new NotFoundException('Projeto nao encontrado.');
    const entries = Array.isArray(current.data.executionEntries) ? current.data.executionEntries : [];
    const index = entries.findIndex((item) => this.sameId(item, expectedId || entryId));
    if (expectedId && index < 0) throw new NotFoundException('Lancamento de execucao nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um lancamento com este identificador.');
    const normalized = this.normalizeEntry(entry, expectedId || entryId, entries[index]);
    const nextEntries = expectedId
      ? entries.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [normalized, ...entries];
    const projectRecord = this.record(projects.find((item) => this.sameId(item, projectId)));
    const financial = this.financialEntry(normalized, this.text(projectRecord?.clientId));
    const financialEntries = Array.isArray(current.data.financialEntries) ? current.data.financialEntries : [];
    const financialIndex = financialEntries.findIndex((item) => this.sameId(item, this.text(financial.id)));
    const nextFinancialEntries = financialIndex >= 0
      ? financialEntries.map((item, itemIndex) => itemIndex === financialIndex ? { ...this.record(item), ...financial } : item)
      : [financial, ...financialEntries];
    const result = await this.forward({ ...current.data, executionEntries: nextEntries, financialEntries: nextFinancialEntries }, input.baseRevision, cookie);
    if (result.status < 400) await this.finance.syncExecutionEntry(financial, cookie);
    return result;
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de lancamento de execucao invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry) throw new BadRequestException('Lancamento de execucao invalido.');
    const projectId = this.text(entry.projectId);
    const date = this.text(entry.date);
    const description = this.text(entry.description);
    const amount = this.number(entry.amount);
    if (!projectId || !date || !description) throw new BadRequestException('O lancamento precisa conter projeto, data e descricao.');
    if (amount < 0) throw new BadRequestException('O valor do lancamento nao pode ser negativo.');
    const entryId = this.text(entry.id) || `exec-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do lancamento nao confere.');
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const project = await client.query('select id, client_id as "clientId" from projects_domain_entries where company_id = $1 and id = $2', [context.companyId, projectId]);
      if (!project.rowCount) throw new NotFoundException('Projeto nao encontrado.');
      const existing = await client.query('select id, extra_data as "extraData", financial_entry_id as "financialEntryId" from execution_domain_entries where company_id = $1 and id = $2', [context.companyId, expectedId || entryId]);
      if (expectedId && !existing.rowCount) throw new NotFoundException('Lancamento de execucao nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um lancamento com este identificador.');
      const normalized = this.normalizeEntry(entry, expectedId || entryId, existing.rows[0]);
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(entry) };
      await client.query(
        `insert into execution_domain_entries
          (company_id, id, project_id, kind, date, person, quantity, amount, description, financial_entry_id, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
         on conflict (company_id, id) do update set
           project_id = excluded.project_id, kind = excluded.kind, date = excluded.date, person = excluded.person,
           quantity = excluded.quantity, amount = excluded.amount, description = excluded.description,
           financial_entry_id = excluded.financial_entry_id, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.projectId, normalized.kind, normalized.date, normalized.person, normalized.quantity,
          normalized.amount, normalized.description, normalized.financialEntryId, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      const financial = this.financialEntry(normalized, this.text(project.rows[0].clientId));
      await this.finance.syncExecutionEntry(financial, cookie);
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, entry: normalized }) };
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
    const role = this.text(user.role);
    if (role !== 'admin' && !permissions.includes('*') && !permissions.includes('execution') && !modules.includes('execution')) {
      throw new ForbiddenException('Seu perfil nao possui acesso a execucao.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: role || 'leitura', permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao' && context.role !== 'operador') throw new ForbiddenException('Seu perfil nao pode alterar a execucao.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:execution:${companyId}`]);
    const result = await client.query('select revision from execution_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into execution_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update execution_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
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
      body: JSON.stringify({ data, baseRevision, resource: 'execution' }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao da execucao.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private entryFromRow(row: RecordItem): ExecutionEntry {
    return this.normalizeEntry({ ...(this.record(row.extraData) || {}), id: row.id, projectId: row.projectId, kind: row.kind, date: row.date, person: row.person, quantity: row.quantity, amount: row.amount, description: row.description, financialEntryId: row.financialEntryId }, this.text(row.id), row);
  }

  private normalizeEntry(item: RecordItem, id: string, existing?: RecordItem): ExecutionEntry {
    return {
      ...item,
      id,
      projectId: this.text(item.projectId),
      kind: kinds.includes(this.text(item.kind)) ? this.text(item.kind) : 'Outros gastos',
      date: this.text(item.date),
      person: this.text(item.person),
      quantity: this.text(item.quantity),
      amount: this.number(item.amount),
      description: this.text(item.description, 'Lancamento sem descricao'),
      financialEntryId: this.text(item.financialEntryId, this.text(existing?.financialEntryId, `fin-exec-${crypto.randomUUID()}`)),
    };
  }

  private financialEntry(entry: ExecutionEntry, clientId: string): RecordItem {
    return {
      id: entry.financialEntryId,
      type: 'Despesa',
      status: 'Realizado',
      amount: entry.amount,
      date: entry.date,
      category: categories[entry.kind],
      responsible: entry.person,
      clientId,
      projectId: entry.projectId,
      description: `[Execução] ${entry.description}`,
    };
  }

  private extraData(item: RecordItem): RecordItem {
    const { id, projectId, kind, date, person, quantity, amount, description, financialEntryId, updatedAt, createdAt, ...extra } = item;
    void id; void projectId; void kind; void date; void person; void quantity; void amount; void description; void financialEntryId; void updatedAt; void createdAt;
    return extra;
  }

  private normalizeList(value: unknown): ExecutionEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeEntry(item, this.text(item.id, `legacy-execution-${index + 1}`)));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }

  private number(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : 0;
  }
}
