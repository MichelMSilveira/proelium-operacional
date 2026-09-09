import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type Evaluation = { id: string; projectId: string; source: string; evaluator: string; collaborator: string; installation: number; service: number; commitment: number; deadline: number; note: string; date: string; [key: string]: unknown };

@Injectable()
export class QualityService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ evaluations: Evaluation[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura das avaliacoes');
    return { evaluations: this.normalizeList(current.data.evaluations), revision: current.revision };
  }

  async save(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de avaliacao invalido.');
    const input = body as { evaluation?: unknown; baseRevision?: unknown };
    const evaluation = this.record(input.evaluation);
    if (!evaluation) throw new BadRequestException('Avaliacao invalida.');
    const projectId = this.text(evaluation.projectId);
    const source = this.text(evaluation.source, 'Interna');
    const evaluator = this.text(evaluation.evaluator);
    const collaborator = this.text(evaluation.collaborator);
    if (!projectId || !evaluator || !collaborator) throw new BadRequestException('A avaliacao precisa conter projeto, avaliador e pessoa avaliada.');
    if (!['Interna', 'Cliente'].includes(source)) throw new BadRequestException('A fonte da avaliacao deve ser Interna ou Cliente.');
    const scores = ['installation', 'service', 'commitment', 'deadline'].map((key) => this.score(evaluation[key]));
    if (scores.some((value) => value < 1 || value > 5)) throw new BadRequestException('As quatro notas devem estar entre 1 e 5.');

    const current = await this.readAggregate(cookie, 'gravacao da avaliacao');
    const evaluations = Array.isArray(current.data.evaluations) ? current.data.evaluations : [];
    const normalized = {
      ...evaluation,
      id: this.text(evaluation.id) || `eva-${crypto.randomUUID()}`,
      projectId,
      source,
      evaluator,
      collaborator,
      installation: scores[0],
      service: scores[1],
      commitment: scores[2],
      deadline: scores[3],
      note: this.text(evaluation.note),
      date: this.text(evaluation.date, new Date().toISOString().slice(0, 10)),
    };
    return this.forward({ ...current.data, evaluations: [normalized, ...evaluations] }, input.baseRevision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de avaliacoes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Evaluation[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-evaluation-${index + 1}`),
      projectId: this.text(item.projectId),
      source: this.text(item.source, 'Interna'),
      evaluator: this.text(item.evaluator),
      collaborator: this.text(item.collaborator),
      installation: this.score(item.installation),
      service: this.score(item.service),
      commitment: this.score(item.commitment),
      deadline: this.score(item.deadline),
      note: this.text(item.note),
      date: this.text(item.date),
    }));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }

  private score(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? Math.max(0, Math.min(5, result)) : 0;
  }
}
