import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

@Injectable()
export class RoutinesService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ routines: RecordItem[]; projectChecklists: RecordItem[]; revision?: number }> {
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
    const current = await this.readCompanyRoutines(cookie);
    if (!current.some((item) => this.sameId(item, expectedId))) throw new NotFoundException('Rotina nao encontrada.');
    return this.forwardCompanyRoutines(current.filter((item) => !this.sameId(item, expectedId)), cookie);
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
