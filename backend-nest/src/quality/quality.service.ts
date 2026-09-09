import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Evaluation = { id: string; projectId: string; source: string; evaluator: string; collaborator: string; installation: number; service: number; commitment: number; deadline: number; note: string; date: string; [key: string]: unknown };

@Injectable()
export class QualityService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Evaluation[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura das avaliações.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar as avaliações.');
    const payload = await upstream.json() as { data?: { evaluations?: unknown } };
    return this.normalizeList(payload.data?.evaluations);
  }

  private normalizeList(value: unknown): Evaluation[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-evaluation-${index + 1}`), projectId: this.text(item.projectId), source: this.text(item.source, 'Interna'),
      evaluator: this.text(item.evaluator), collaborator: this.text(item.collaborator), installation: this.score(item.installation), service: this.score(item.service),
      commitment: this.score(item.commitment), deadline: this.score(item.deadline), note: this.text(item.note), date: this.text(item.date),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private score(value: unknown): number { const result = Number(value); return Number.isFinite(result) ? Math.max(0, Math.min(5, result)) : 0; }
}
