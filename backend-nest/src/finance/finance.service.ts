import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type FinancialEntry = {
  id: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  responsible: string;
  clientId: string;
  projectId: string;
  accountId: string;
  [key: string]: unknown;
};
export type FinancialAccount = { id: string; name: string; institution: string; type: string; initialBalance: number; status: string; notes: string; [key: string]: unknown };

const accountTypes = ['Corrente', 'Poupança', 'Carteira digital'];
const accountStatuses = ['Ativa', 'Inativa'];

@Injectable()
export class FinanceService {
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

  async list(cookie?: string): Promise<{ entries: FinancialEntry[]; accounts: FinancialAccount[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [entries, accounts, state] = await Promise.all([
        this.pool.query(
          `select id, type, status, amount, date, category, description, responsible,
                  client_id as "clientId", project_id as "projectId", account_id as "accountId", extra_data as "extraData"
           from finance_domain_entries where company_id = $1 order by date desc, updated_at desc, description asc`,
          [context.companyId],
        ),
        this.pool.query(
          `select id, name, institution, account_type as type, initial_balance as "initialBalance", status, notes, extra_data as "extraData"
           from finance_domain_accounts where company_id = $1 order by name asc, updated_at desc`,
          [context.companyId],
        ),
        this.pool.query('select revision from finance_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        entries: entries.rows.map((row) => this.entryFromRow(row)),
        accounts: accounts.rows.map((row) => this.accountFromRow(row)),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do financeiro.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os lancamentos financeiros.');
    const payload = await upstream.json() as AggregateResponse;
    return { entries: this.normalizeList(payload.data?.financialEntries), accounts: this.normalizeAccounts(payload.data?.financialAccounts), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de lancamento invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry || !this.text(entry.description ?? entry.name ?? entry.nome).trim()) throw new BadRequestException('O lancamento precisa conter descricao.');
    const entryId = this.text(entry.id) || `fin-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do lancamento nao confere.');
    const amount = this.number(entry.amount ?? entry.value ?? entry.valor);
    if (amount <= 0) throw new BadRequestException('O lancamento precisa conter valor maior que zero.');
    const current = await this.readAggregate(cookie);
    const entries = Array.isArray(current.data.financialEntries) ? current.data.financialEntries : [];
    const index = entries.findIndex((item) => this.sameId(item, expectedId || entryId));
    if (expectedId && index < 0) throw new NotFoundException('Lancamento financeiro nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um lancamento com este identificador.');
    const normalized = this.normalizeEntry(entry, expectedId || entryId);
    const nextEntries = expectedId
      ? entries.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [...entries, normalized];
    return this.forward({ ...current.data, financialEntries: nextEntries }, input.baseRevision, cookie);
  }

  async remove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador do lancamento e obrigatorio.');
    if (this.pool) return this.databaseRemove(id, cookie);
    const current = await this.readAggregate(cookie);
    const entries = Array.isArray(current.data.financialEntries) ? current.data.financialEntries : [];
    if (!entries.some((item) => this.sameId(item, id))) throw new NotFoundException('Lancamento financeiro nao encontrado.');
    return this.forward({ ...current.data, financialEntries: entries.filter((item) => !this.sameId(item, id)) }, current.revision, cookie);
  }

  async saveAccount(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSaveAccount(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de conta invalido.');
    const input = body as { account?: unknown; baseRevision?: unknown };
    const account = this.record(input.account);
    if (!account) throw new BadRequestException('Conta financeira invalida.');
    const name = this.text(account.name);
    if (!name) throw new BadRequestException('A conta precisa conter nome.');
    const accountId = this.text(account.id) || `acc-${crypto.randomUUID()}`;
    if (expectedId && accountId !== expectedId) throw new BadRequestException('O identificador da conta nao confere.');
    const current = await this.readAggregate(cookie);
    const accounts = Array.isArray(current.data.financialAccounts) ? current.data.financialAccounts : [];
    const index = accounts.findIndex((item) => this.sameId(item, expectedId || accountId));
    if (expectedId && index < 0) throw new NotFoundException('Conta financeira nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma conta com este identificador.');
    const normalized = this.normalizeAccount(account, expectedId || accountId);
    const nextAccounts = expectedId
      ? accounts.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [normalized, ...accounts];
    return this.forward({ ...current.data, financialAccounts: nextAccounts }, input.baseRevision, cookie);
  }

  async syncExecutionEntry(value: unknown, cookie?: string): Promise<void> {
    if (!this.pool) return;
    const context = await this.authContext(cookie, true);
    if (!['admin', 'financeiro', 'operacao', 'operador'].includes(context.role)) throw new ForbiddenException('Seu perfil nao pode registrar custo de execucao.');
    const entry = this.record(value);
    if (!entry) throw new BadRequestException('Lancamento financeiro de execucao invalido.');
    const id = this.text(entry.id) || `fin-exec-${crypto.randomUUID()}`;
    const normalized = this.normalizeEntry(entry, id);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await this.lockRevision(client, context.companyId);
      const existing = await client.query('select extra_data as "extraData" from finance_domain_entries where company_id = $1 and id = $2', [context.companyId, id]);
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(entry, 'entry') };
      await client.query(
        `insert into finance_domain_entries
          (company_id, id, type, status, amount, date, category, description, responsible, client_id, project_id, account_id, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
         on conflict (company_id, id) do update set
           type = excluded.type, status = excluded.status, amount = excluded.amount, date = excluded.date,
           category = excluded.category, description = excluded.description, responsible = excluded.responsible,
           client_id = excluded.client_id, project_id = excluded.project_id, account_id = excluded.account_id,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.type, normalized.status, normalized.amount, normalized.date, normalized.category,
          normalized.description, normalized.responsible, normalized.clientId, normalized.projectId, normalized.accountId, JSON.stringify(extraData)],
      );
      await this.bumpRevision(client, context.companyId);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de lancamento invalido.');
    const input = body as { entry?: unknown; baseRevision?: unknown };
    const entry = this.record(input.entry);
    if (!entry || !this.text(entry.description ?? entry.name ?? entry.nome)) throw new BadRequestException('O lancamento precisa conter descricao.');
    const amount = this.number(entry.amount ?? entry.value ?? entry.valor);
    if (amount <= 0) throw new BadRequestException('O lancamento precisa conter valor maior que zero.');
    const entryId = this.text(entry.id) || `fin-${crypto.randomUUID()}`;
    if (expectedId && entryId !== expectedId) throw new BadRequestException('O identificador do lancamento nao confere.');
    const normalized = this.normalizeEntry(entry, expectedId || entryId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query('select id, extra_data as "extraData" from finance_domain_entries where company_id = $1 and id = $2', [context.companyId, normalized.id]);
      if (expectedId && !existing.rowCount) throw new NotFoundException('Lancamento financeiro nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um lancamento com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(entry, 'entry') };
      await client.query(
        `insert into finance_domain_entries
          (company_id, id, type, status, amount, date, category, description, responsible, client_id, project_id, account_id, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
         on conflict (company_id, id) do update set
           type = excluded.type, status = excluded.status, amount = excluded.amount, date = excluded.date,
           category = excluded.category, description = excluded.description, responsible = excluded.responsible,
           client_id = excluded.client_id, project_id = excluded.project_id, account_id = excluded.account_id,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.type, normalized.status, normalized.amount, normalized.date, normalized.category,
          normalized.description, normalized.responsible, normalized.clientId, normalized.projectId, normalized.accountId, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, entry: normalized }) };
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
      const deleted = await client.query('delete from finance_domain_entries where company_id = $1 and id = $2 returning id', [context.companyId, id.trim()]);
      if (!deleted.rowCount) throw new NotFoundException('Lancamento financeiro nao encontrado.');
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

  private async databaseSaveAccount(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de conta invalido.');
    const input = body as { account?: unknown; baseRevision?: unknown };
    const account = this.record(input.account);
    if (!account) throw new BadRequestException('Conta financeira invalida.');
    const normalized = this.normalizeAccount(account, expectedId || this.text(account.id) || `acc-${crypto.randomUUID()}`);
    if (!normalized.name) throw new BadRequestException('A conta precisa conter nome.');
    if (expectedId && normalized.id !== expectedId) throw new BadRequestException('O identificador da conta nao confere.');
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query('select id, extra_data as "extraData" from finance_domain_accounts where company_id = $1 and id = $2', [context.companyId, normalized.id]);
      if (expectedId && !existing.rowCount) throw new NotFoundException('Conta financeira nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma conta com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(account, 'account') };
      await client.query(
        `insert into finance_domain_accounts
          (company_id, id, name, institution, account_type, initial_balance, status, notes, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
         on conflict (company_id, id) do update set
           name = excluded.name, institution = excluded.institution, account_type = excluded.account_type,
           initial_balance = excluded.initial_balance, status = excluded.status, notes = excluded.notes,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.name, normalized.institution, normalized.type, normalized.initialBalance,
          normalized.status, normalized.notes, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, account: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async authContext(cookie?: string, allowExecution = false): Promise<AuthContext> {
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
    const role = this.text(user.role);
    const financeAccess = role === 'admin' || permissions.includes('*') || permissions.includes('finance') || modules.includes('finance');
    const executionAccess = role === 'admin' || role === 'operacao' || role === 'operador' || permissions.includes('execution') || modules.includes('execution');
    if (!financeAccess && !(allowExecution && executionAccess)) {
      throw new ForbiddenException('Seu perfil nao possui acesso ao financeiro.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: role || 'leitura', permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'financeiro') throw new ForbiddenException('Seu perfil nao pode alterar o financeiro.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:finance:${companyId}`]);
    const result = await client.query('select revision from finance_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into finance_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update finance_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private async readAggregate(cookie?: string): Promise<AggregateResponse & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do financeiro.');
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao financeira.');
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do financeiro.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private entryFromRow(row: RecordItem): FinancialEntry {
    return this.normalizeEntry({ ...(this.record(row.extraData) || {}), id: row.id, type: row.type, status: row.status, amount: row.amount, date: row.date, category: row.category, description: row.description, responsible: row.responsible, clientId: row.clientId, projectId: row.projectId, accountId: row.accountId }, this.text(row.id));
  }

  private accountFromRow(row: RecordItem): FinancialAccount {
    return this.normalizeAccount({ ...(this.record(row.extraData) || {}), id: row.id, name: row.name, institution: row.institution, type: row.type, initialBalance: row.initialBalance, status: row.status, notes: row.notes }, this.text(row.id));
  }

  private normalizeEntry(item: RecordItem, id: string): FinancialEntry {
    return {
      ...item,
      id,
      type: this.text(item.type, 'Despesa'),
      status: this.text(item.status, 'Realizado'),
      amount: this.number(item.amount ?? item.value ?? item.valor),
      date: this.text(item.date, new Date().toISOString().slice(0, 10)),
      category: this.text(item.category ?? item.categoria, 'Sem categoria'),
      description: this.text(item.description ?? item.name ?? item.nome, 'Lancamento sem descricao'),
      responsible: this.text(item.responsible),
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      accountId: this.text(item.accountId),
    };
  }

  private normalizeAccount(item: RecordItem, id: string): FinancialAccount {
    const type = this.text(item.type);
    const status = this.text(item.status);
    return {
      ...item,
      id,
      name: this.text(item.name),
      institution: this.text(item.institution),
      type: accountTypes.includes(type) ? type : 'Corrente',
      initialBalance: this.number(item.initialBalance),
      status: accountStatuses.includes(status) ? status : 'Ativa',
      notes: this.text(item.notes),
    };
  }

  private normalizeList(value: unknown): FinancialEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeEntry(item, this.text(item.id, `legacy-financial-entry-${index + 1}`)));
  }

  private normalizeAccounts(value: unknown): FinancialAccount[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeAccount(item, this.text(item.id, `legacy-financial-account-${index + 1}`)));
  }

  private extraData(item: RecordItem, kind: 'entry' | 'account'): RecordItem {
    if (kind === 'entry') {
      const { id, type, status, amount, value, valor, date, category, categoria, description, name, nome, responsible, clientId, projectId, accountId, updatedAt, createdAt, ...extra } = item;
      void id; void type; void status; void amount; void value; void valor; void date; void category; void categoria; void description; void name; void nome; void responsible; void clientId; void projectId; void accountId; void updatedAt; void createdAt;
      return extra;
    }
    const { id, name, institution, type, initialBalance, status, notes, updatedAt, createdAt, ...extra } = item;
    void id; void name; void institution; void type; void initialBalance; void status; void notes; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
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

  private number(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : 0;
  }
}
