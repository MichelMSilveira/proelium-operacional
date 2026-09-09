import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type TechnicalConnection = RecordItem & {
  id: string;
  projectId: string;
  fromId: string;
  fromLabel: string;
  fromPort: string;
  toId: string;
  toLabel: string;
  toPort: string;
  cable: string;
  status: string;
};

@Injectable()
export class DiagramService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ connections: TechnicalConnection[]; edits: RecordItem[]; overrides: RecordItem[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura do diagrama');
    return {
      connections: this.normalizeList(current.data.technicalConnections),
      edits: this.normalizeRecords(current.data.technicalConnectionEdits),
      overrides: this.normalizeRecords(current.data.technicalConnectionOverrides),
      revision: current.revision,
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ligacao tecnica invalido.');
    const input = body as { connection?: unknown; baseRevision?: unknown };
    const connection = this.record(input.connection);
    if (!connection) throw new BadRequestException('Ligacao tecnica invalida.');

    const projectId = this.text(connection.projectId);
    const fromId = this.text(connection.fromId);
    const toId = this.text(connection.toId);
    const fromLabel = this.text(connection.fromLabel, fromId || 'Origem externa');
    const toLabel = this.text(connection.toLabel, toId || 'Destino a confirmar');
    const fromPort = this.text(connection.fromPort, 'Saida a confirmar');
    const toPort = this.text(connection.toPort, 'Entrada a confirmar');
    const cable = this.text(connection.cable, 'Cabo a confirmar');
    if (!projectId || !toId || fromId === toId) throw new BadRequestException('A ligacao precisa conter projeto, origem e destino diferentes.');
    if (!fromPort || !toPort || !cable) throw new BadRequestException('A ligacao precisa conter portas e cabo.');

    const current = await this.readAggregate(cookie, 'gravacao do diagrama');
    const projects = Array.isArray(current.data.projects) ? current.data.projects : [];
    if (!projects.some((item) => this.sameId(item, projectId))) throw new NotFoundException('Projeto nao encontrado.');
    const connections = this.normalizeList(current.data.technicalConnections);
    const connectionId = this.text(connection.id) || `conn-next-${crypto.randomUUID()}`;
    const index = connections.findIndex((item) => item.id === (expectedId || connectionId));
    if (expectedId && index < 0) throw new NotFoundException('Ligacao tecnica nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma ligacao com este identificador.');
    const duplicate = connections.some((item, itemIndex) => itemIndex !== index && item.projectId === projectId && item.fromId === fromId && item.fromPort === fromPort && item.toId === toId && item.toPort === toPort);
    if (duplicate) throw new BadRequestException('Essa ligacao ja esta registrada.');

    const normalized: TechnicalConnection = {
      ...connection,
      id: expectedId || connectionId,
      projectId,
      fromId,
      fromLabel,
      fromPort,
      toId,
      toLabel,
      toPort,
      cable,
      status: this.text(connection.status, 'Proposto - confirmar'),
      cableCount: Number(connection.cableCount) > 0 ? Number(connection.cableCount) : 1,
      origin: this.text(connection.origin, 'Manual Proelium'),
      updatedAt: new Date().toISOString(),
    };
    const nextConnections = expectedId
      ? connections.map((item, itemIndex) => itemIndex === index ? normalized : item)
      : [normalized, ...connections];
    return this.forward({ ...current.data, technicalConnections: nextConnections }, input.baseRevision, cookie);
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
      body: JSON.stringify({ data, baseRevision, resource: 'diagram' }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do diagrama.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): TechnicalConnection[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-connection-${index + 1}`),
      projectId: this.text(item.projectId),
      fromId: this.text(item.fromId),
      fromLabel: this.text(item.fromLabel, 'Origem externa'),
      fromPort: this.text(item.fromPort, 'Saida a confirmar'),
      toId: this.text(item.toId),
      toLabel: this.text(item.toLabel, 'Destino a confirmar'),
      toPort: this.text(item.toPort, 'Entrada a confirmar'),
      cable: this.text(item.cable, 'Cabo a confirmar'),
      status: this.text(item.status, 'Proposto - confirmar'),
    }));
  }

  private normalizeRecords(value: unknown): RecordItem[] {
    return Array.isArray(value) ? value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object') : [];
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
