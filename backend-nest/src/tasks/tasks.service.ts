import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type Task = { id: string; title: string; projectId: string; responsible: string; due: string; status: string; priority: string; [key: string]: unknown };

const statuses = ['Aberta', 'Em andamento', 'Concluída', 'Bloqueada'];
const priorities = ['Baixa', 'Média', 'Alta', 'Urgente'];

@Injectable()
export class TasksService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ tasks: Task[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura de tarefas');
    return { tasks: this.normalizeList(current.data.tasks), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
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
    const current = await this.readAggregate(cookie, 'gravacao de tarefas');
    const tasks = Array.isArray(current.data.tasks) ? current.data.tasks : [];
    if (!tasks.some((entry) => this.sameId(entry, id))) throw new NotFoundException('Tarefa nao encontrada.');
    return this.forward({ ...current.data, tasks: tasks.filter((entry) => !this.sameId(entry, id)) }, current.revision, cookie);
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
