import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

@Injectable()
export class RoutinesService {
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

  async list(cookie?: string): Promise<{ routines: RecordItem[]; projectChecklists: RecordItem[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [routines, checklists] = await Promise.all([
        this.pool.query(
          `select id, name, description, periodicity, steps, created_at as "createdAt", updated_at as "updatedAt"
           from routines where company_id = $1 order by updated_at desc, name asc`,
          [context.companyId],
        ),
        this.readAggregate(cookie, 'leitura dos checklists'),
      ]);
      return {
        routines: this.normalizeList(routines.rows),
        projectChecklists: this.normalizeList(checklists.data.projectChecklists),
        revision: checklists.revision,
      };
    }
    const headers: Record<string, string> = cookie ? { cookie } : {};
    const [routinesResponse, dataResponse] = await Promise.all([
      fetch(`${this.legacyOrigin}/api/company/routines`, { headers }).catch(() => null),
      fetch(`${this.legacyOrigin}/api/data`, { headers }).catch(() => null),
    ]);
    if (!routinesResponse?.ok || !dataResponse?.ok) {
      throw new ServiceUnavailableException('Nao foi possivel carregar as rotinas e checklists.');
    }
    const routinesPayload = await routinesResponse.json() as { routines?: unknown };
    const dataPayload = await dataResponse.json() as AggregateResponse;
    return {
      routines: this.normalizeList(routinesPayload.routines),
      projectChecklists: this.normalizeList(dataPayload.data?.projectChecklists),
      revision: dataPayload.revision,
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de rotina invalido.');
    const input = body as { routine?: unknown };
    const routine = this.record(input.routine);
    if (!routine || !String(routine.name || '').trim()) throw new BadRequestException('A rotina precisa conter nome.');
    const routineId = String(routine.id || '');
    if (expectedId && (!routineId || routineId !== expectedId)) throw new BadRequestException('O identificador da rotina nao confere.');
    const current = await this.readCompanyRoutines(cookie);
    const index = current.findIndex((item) => this.sameId(item, expectedId || routineId));
    if (expectedId && index < 0) throw new NotFoundException('Rotina nao encontrada.');
    const normalized = {
      ...routine,
      id: routineId || `routine-${Date.now()}`,
      name: this.text(routine.name),
      description: this.text(routine.description),
      periodicity: this.text(routine.periodicity, 'Sem periodicidade'),
      steps: Array.isArray(routine.steps) ? routine.steps.filter((step) => typeof step === 'string').map((step) => step.trim()).filter(Boolean) : [],
    };
    const routines = expectedId
      ? current.map((item, itemIndex) => itemIndex === index ? { ...item, ...normalized, id: expectedId } : item)
      : [...current, normalized];
    return this.forwardCompanyRoutines(routines, cookie);
  }

  async remove(cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!expectedId) throw new BadRequestException('O identificador da rotina e obrigatorio.');
    if (this.pool) return this.databaseRemove(cookie, expectedId);
    const current = await this.readCompanyRoutines(cookie);
    if (!current.some((item) => this.sameId(item, expectedId))) throw new NotFoundException('Rotina nao encontrada.');
    return this.forwardCompanyRoutines(current.filter((item) => !this.sameId(item, expectedId)), cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de rotina invalido.');
    const input = body as { routine?: unknown };
    const routine = this.record(input.routine);
    if (!routine || !this.text(routine.name)) throw new BadRequestException('A rotina precisa conter nome.');
    const routineId = this.text(routine.id) || `routine-${crypto.randomUUID()}`;
    if (expectedId && routineId !== expectedId) throw new BadRequestException('O identificador da rotina nao confere.');
    const normalized = {
      id: expectedId || routineId,
      name: this.text(routine.name),
      description: this.text(routine.description),
      periodicity: this.text(routine.periodicity, 'Sem periodicidade'),
      steps: Array.isArray(routine.steps) ? routine.steps.filter((step) => typeof step === 'string').map((step) => step.trim()).filter(Boolean) : [],
    };
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:routines:${context.companyId}`]);
      await this.ensureRevisionRow(client, context.companyId);
      const existing = await client.query('select id, company_id as "companyId" from routines where id = $1', [normalized.id]);
      if (existing.rowCount && this.text(existing.rows[0].companyId) !== context.companyId) throw new BadRequestException('Ja existe uma rotina com este identificador.');
      if (expectedId && !existing.rowCount) throw new NotFoundException('Rotina nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma rotina com este identificador.');
      await client.query(
        `insert into routines (id, company_id, name, description, periodicity, steps, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, now())
         on conflict (id) do update set name = excluded.name, description = excluded.description,
           periodicity = excluded.periodicity, steps = excluded.steps, updated_at = now()`,
        [normalized.id, context.companyId, normalized.name, normalized.description, normalized.periodicity, JSON.stringify(normalized.steps)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, routine: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseRemove(cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:routines:${context.companyId}`]);
      await this.ensureRevisionRow(client, context.companyId);
      const deleted = await client.query('delete from routines where company_id = $1 and id = $2 returning id', [context.companyId, expectedId]);
      if (!deleted.rowCount) throw new NotFoundException('Rotina nao encontrada.');
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, id: expectedId }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('routines') && !modules.includes('routines')) {
      throw new ForbiddenException('Seu perfil nao possui acesso as rotinas.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar rotinas.');
    }
  }

  private async ensureRevisionRow(client: PoolClient, companyId: string): Promise<void> {
    const result = await client.query('select revision from routines_domain_state where company_id = $1 for update', [companyId]);
    if (!result.rowCount) await client.query('insert into routines_domain_state (company_id, revision) values ($1, 0)', [companyId]);
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update routines_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  async saveChecklist(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de checklist invalido.');
    const input = body as { checklist?: unknown; baseRevision?: unknown };
    const checklist = this.record(input.checklist);
    if (!checklist) throw new BadRequestException('Checklist invalido.');
    const projectId = this.text(checklist.projectId);
    const title = this.text(checklist.title ?? checklist.name);
    if (!projectId || !title) throw new BadRequestException('O checklist precisa conter projeto e verificacao.');
    const checklistId = this.text(checklist.id) || `chk-${crypto.randomUUID()}`;
    if (expectedId && checklistId !== expectedId) throw new BadRequestException('O identificador do checklist nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de checklists');
    const checklists = Array.isArray(current.data.projectChecklists) ? current.data.projectChecklists : [];
    const index = checklists.findIndex((entry) => this.sameId(entry, expectedId || checklistId));
    if (expectedId && index < 0) throw new NotFoundException('Checklist nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um checklist com este identificador.');
    const normalized = {
      ...checklist,
      id: expectedId || checklistId,
      projectId,
      title,
      phase: this.text(checklist.phase, 'Projeto técnico'),
      done: Boolean(checklist.done),
      standard: Boolean(checklist.standard),
    };
    const nextChecklists = expectedId
      ? checklists.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [...checklists, normalized];
    return this.forwardAggregate({ ...current.data, projectChecklists: nextChecklists }, input.baseRevision, cookie);
  }

  private async readCompanyRoutines(cookie?: string): Promise<RecordItem[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/company/routines`, { headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!upstream?.ok) throw new ServiceUnavailableException('Nao foi possivel preparar as rotinas.');
    const payload = await upstream.json() as { routines?: unknown };
    return this.normalizeList(payload.routines);
  }

  private async forwardCompanyRoutines(routines: RecordItem[], cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/company/routines`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ routines }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de rotinas.');
    });
    return { status: upstream.status, body: await upstream.text() };
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

  private async forwardAggregate(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de checklists.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): RecordItem[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-routine-${index + 1}`),
      name: this.text(item.name ?? item.title, `Rotina ${index + 1}`),
      description: this.text(item.description ?? item.summary),
      status: this.text(item.status ?? item.category ?? item.categoria, 'Procedimento'),
    }));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
