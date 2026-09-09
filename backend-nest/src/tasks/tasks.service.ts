import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Task = { id: string; title: string; projectId: string; responsible: string; due: string; status: string; priority: string; [key: string]: unknown };

const statuses = ['Aberta', 'Em andamento', 'Concluída', 'Bloqueada'];
const priorities = ['Baixa', 'Média', 'Alta', 'Urgente'];

@Injectable()
export class TasksService {
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

  async list(cookie?: string): Promise<{ tasks: Task[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [tasks, state] = await Promise.all([
        this.pool.query(
          `select id, title, project_id as "projectId", responsible, due, task_time as time, status, priority, extra_data as "extraData"
           from tasks_domain_entries where company_id = $1 order by updated_at desc, title asc`,
          [context.companyId],
        ),
        this.pool.query('select revision from tasks_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        tasks: tasks.rows.map((row) => this.taskFromRow(row)),
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
    const current = await this.readAggregate(cookie, 'leitura de tarefas');
    return { tasks: this.normalizeList(current.data.tasks), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de tarefa invalido.');
    const input = body as { task?: unknown; baseRevision?: unknown };
    const task = this.record(input.task);
    if (!task) throw new BadRequestException('Tarefa invalida.');
    const title = this.text(task.title);
    const projectId = this.text(task.projectId);
    if (!title || !projectId) throw new BadRequestException('A tarefa precisa conter projeto e titulo.');
    const taskId = this.text(task.id) || `tsk-${crypto.randomUUID()}`;
    if (expectedId && taskId !== expectedId) throw new BadRequestException('O identificador da tarefa nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de tarefas');
    const tasks = Array.isArray(current.data.tasks) ? current.data.tasks : [];
    const index = tasks.findIndex((entry) => this.sameId(entry, expectedId || taskId));
    if (expectedId && index < 0) throw new NotFoundException('Tarefa nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma tarefa com este identificador.');
    const responsible = this.text(task.responsible ?? task.assignee);
    const normalized = {
      ...task,
      id: expectedId || taskId,
      title,
      projectId,
      assignee: responsible,
      responsible,
      due: this.text(task.due),
      time: this.text(task.time),
      status: statuses.includes(this.text(task.status)) ? this.text(task.status) : 'Aberta',
      priority: priorities.includes(this.text(task.priority)) ? this.text(task.priority) : 'Média',
    };
    const nextTasks = expectedId
      ? tasks.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [...tasks, normalized];
    return this.forward({ ...current.data, tasks: nextTasks }, input.baseRevision, cookie);
  }

  async remove(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador da tarefa e obrigatorio.');
    if (this.pool) return this.databaseRemove(id, cookie);
    const current = await this.readAggregate(cookie, 'gravacao de tarefas');
    const tasks = Array.isArray(current.data.tasks) ? current.data.tasks : [];
    if (!tasks.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Tarefa nao encontrada.');
    return this.forward({ ...current.data, tasks: tasks.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de tarefa invalido.');
    const input = body as { task?: unknown; baseRevision?: unknown };
    const task = this.record(input.task);
    if (!task) throw new BadRequestException('Tarefa invalida.');
    const title = this.text(task.title);
    const projectId = this.text(task.projectId);
    if (!title || !projectId) throw new BadRequestException('A tarefa precisa conter projeto e titulo.');
    const taskId = this.text(task.id) || `tsk-${crypto.randomUUID()}`;
    if (expectedId && taskId !== expectedId) throw new BadRequestException('O identificador da tarefa nao confere.');
    const normalized = this.normalize(task, expectedId || taskId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from tasks_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Tarefa nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma tarefa com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(task) };
      await client.query(
        `insert into tasks_domain_entries
          (company_id, id, title, project_id, responsible, due, task_time, status, priority, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
         on conflict (company_id, id) do update set
           title = excluded.title, project_id = excluded.project_id, responsible = excluded.responsible,
           due = excluded.due, task_time = excluded.task_time, status = excluded.status,
           priority = excluded.priority, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.title, normalized.projectId, normalized.responsible,
          normalized.due, normalized.time, normalized.status, normalized.priority, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, task: normalized }) };
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
        'delete from tasks_domain_entries where company_id = $1 and id = $2 returning id',
        [context.companyId, id.trim()],
      );
      if (!deleted.rowCount) throw new NotFoundException('Tarefa nao encontrada.');
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('tasks') && !modules.includes('tasks')) {
      throw new ForbiddenException('Seu perfil nao possui acesso as tarefas.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar tarefas.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:tasks:${companyId}`]);
    const result = await client.query('select revision from tasks_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into tasks_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update tasks_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private taskFromRow(row: RecordItem): Task {
    return this.normalize({ ...(this.record(row.extraData) || {}), id: row.id, title: row.title, projectId: row.projectId, responsible: row.responsible, due: row.due, time: row.time, status: row.status, priority: row.priority }, this.text(row.id));
  }

  private normalize(item: RecordItem, id: string): Task {
    const responsible = this.text(item.responsible ?? item.assignee);
    return {
      ...item,
      id,
      title: this.text(item.title, 'Tarefa sem titulo'),
      projectId: this.text(item.projectId),
      assignee: responsible,
      responsible,
      due: this.text(item.due),
      time: this.text(item.time),
      status: statuses.includes(this.text(item.status)) ? this.text(item.status) : 'Aberta',
      priority: priorities.includes(this.text(item.priority)) ? this.text(item.priority) : 'MÃ©dia',
    };
  }

  private extraData(task: RecordItem): RecordItem {
    const { id, title, projectId, responsible, assignee, due, time, status, priority, updatedAt, createdAt, ...extra } = task;
    void id; void title; void projectId; void responsible; void assignee; void due; void time; void status; void priority; void updatedAt; void createdAt;
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de tarefas.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Task[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => {
      const responsible = this.text(item.responsible ?? item.assignee);
      return {
        ...item,
        id: this.text(item.id, `legacy-task-${index + 1}`),
        title: this.text(item.title, 'Tarefa sem titulo'),
        projectId: this.text(item.projectId),
        assignee: responsible,
        responsible,
        due: this.text(item.due),
        time: this.text(item.time),
        status: statuses.includes(this.text(item.status)) ? this.text(item.status) : 'Aberta',
        priority: priorities.includes(this.text(item.priority)) ? this.text(item.priority) : 'Média',
      };
    });
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
