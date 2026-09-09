import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type Collaborator = {
  id: string;
  name: string;
  role: string;
  specialty: string;
  relationship: string;
  availability: string;
  compensation: string;
  status: string;
  [key: string]: unknown;
};

@Injectable()
export class CollaboratorsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ collaborators: Collaborator[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura de colaboradores');
    return { collaborators: this.normalizeList(current.data.collaborators), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de colaborador invalido.');
    const input = body as { collaborator?: unknown; baseRevision?: unknown };
    const collaborator = this.record(input.collaborator);
    if (!collaborator) throw new BadRequestException('Colaborador invalido.');
    const name = this.text(collaborator.name);
    const role = this.text(collaborator.role);
    if (!name || !role) throw new BadRequestException('O colaborador precisa conter nome e funcao.');
    const collaboratorId = this.text(collaborator.id) || `col-${crypto.randomUUID()}`;
    if (expectedId && collaboratorId !== expectedId) throw new BadRequestException('O identificador do colaborador nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de colaboradores');
    const collaborators = Array.isArray(current.data.collaborators) ? current.data.collaborators : [];
    const index = collaborators.findIndex((entry) => this.sameId(entry, expectedId || collaboratorId));
    if (expectedId && index < 0) throw new NotFoundException('Colaborador nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um colaborador com este identificador.');
    const normalized = this.normalize(collaborator, expectedId || collaboratorId);
    const nextCollaborators = expectedId
      ? collaborators.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...collaborators];
    return this.forward({ ...current.data, collaborators: nextCollaborators }, input.baseRevision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de colaboradores.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Collaborator[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalize(item, this.text(item.id, `legacy-collaborator-${index + 1}`)));
  }

  private normalize(item: RecordItem, id: string): Collaborator {
    return {
      ...item,
      id,
      name: this.text(item.name, 'Colaborador sem nome'),
      role: this.text(item.role),
      specialty: this.text(item.specialty),
      relationship: this.text(item.relationship),
      availability: this.text(item.availability),
      compensation: this.text(item.compensation),
      status: this.text(item.status, 'Ativo'),
    };
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
