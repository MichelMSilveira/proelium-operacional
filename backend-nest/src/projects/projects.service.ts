import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Project = { id: string; name: string; clientId: string; technicalStage: string; status: string; manager: string; progress: number; budget: number; [key: string]: unknown };

@Injectable()
export class ProjectsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Project[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de projetos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os projetos.');
    const payload = await upstream.json() as { data?: { projects?: unknown } };
    return this.normalizeList(payload.data?.projects);
  }

  private normalizeList(value: unknown): Project[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-project-${index + 1}`), name: this.text(item.name, 'Projeto sem nome'),
      clientId: this.text(item.clientId), technicalStage: this.text(item.technicalStage, 'Projeto técnico'),
      status: this.text(item.status, 'Planejamento'), manager: this.text(item.manager),
      progress: this.percent(item.progress), budget: this.number(item.budget),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
  private percent(value: unknown): number { return Math.min(100, this.number(value)); }
}
