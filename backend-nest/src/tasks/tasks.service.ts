import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Task = { id: string; title: string; projectId: string; responsible: string; due: string; status: string; priority: string; [key: string]: unknown };

@Injectable()
export class TasksService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Task[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de tarefas.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar as tarefas.');
    const payload = await upstream.json() as { data?: { tasks?: unknown } };
    return this.normalizeList(payload.data?.tasks);
  }

  private normalizeList(value: unknown): Task[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-task-${index + 1}`), title: this.text(item.title, 'Tarefa sem título'),
      projectId: this.text(item.projectId), responsible: this.text(item.responsible), due: this.text(item.due),
      status: this.text(item.status, 'Aberta'), priority: this.text(item.priority, 'Normal'),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
