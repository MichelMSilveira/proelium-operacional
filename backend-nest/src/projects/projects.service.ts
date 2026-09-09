import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type Project = { id: string; name: string; clientId: string; technicalStage: string; status: string; manager: string; progress: number; budget: number; [key: string]: unknown };

type Aggregate = { revision?: number; data?: Record<string, unknown> };

@Injectable()
export class ProjectsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ projects: Project[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de projetos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os projetos.');
    const payload = await upstream.json() as Aggregate;
    return { projects: this.normalizeList(payload.data?.projects), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { project?: unknown; baseRevision?: unknown };
    const project = this.record(input.project);
    if (!project) throw new BadRequestException('A gravacao precisa conter um projeto valido.');
    const projectId = String(project.id || '');
    if (!projectId) throw new BadRequestException('O projeto precisa conter identificador.');
    if (expectedId && projectId !== expectedId) throw new BadRequestException('O identificador do projeto nao confere.');

    const current = await this.readAggregate(cookie);
    const currentProjects = Array.isArray(current.data.projects) ? current.data.projects : [];
    const index = currentProjects.findIndex((item) => this.sameId(item, expectedId || projectId));
    if (expectedId && index < 0) throw new NotFoundException('Projeto nao encontrado.');
    const projects = expectedId
      ? currentProjects.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...project, id: expectedId } : item)
      : [...currentProjects, project];
    return this.forwardSave({ ...current.data, projects }, input.baseRevision, cookie);
  }

  async remove(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!expectedId) throw new BadRequestException('O identificador do projeto e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const current = await this.readAggregate(cookie);
    const currentProjects = Array.isArray(current.data.projects) ? current.data.projects : [];
    if (!currentProjects.some((item) => this.sameId(item, expectedId))) throw new NotFoundException('Projeto nao encontrado.');
    return this.forwardSave({ ...current.data, projects: currentProjects.filter((item) => !this.sameId(item, expectedId)) }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de projetos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de projetos.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de projetos.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Project[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-project-${index + 1}`), name: this.text(item.name, 'Projeto sem nome'),
      clientId: this.text(item.clientId), technicalStage: this.text(item.technicalStage, 'Projeto tecnico'),
      status: this.text(item.status, 'Planejamento'), manager: this.text(item.manager),
      progress: this.percent(item.progress), budget: this.number(item.budget),
    }));
  }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
  private percent(value: unknown): number { return Math.min(100, this.number(value)); }
}
