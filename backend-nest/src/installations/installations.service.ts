import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type Installation = { id: string; clientId: string; projectId: string; type: string; site: string; lead: string; stage: string; progress: number; due: string; status: string; [key: string]: unknown };

@Injectable()
export class InstallationsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ installations: Installation[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura das instalacoes');
    return { installations: this.normalizeList(current.data.installations), revision: current.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de instalacao invalido.');
    const input = body as { installation?: unknown; baseRevision?: unknown };
    const installation = this.record(input.installation);
    if (!installation) throw new BadRequestException('Instalacao invalida.');
    const clientId = this.text(installation.clientId);
    const projectId = this.text(installation.projectId);
    const type = this.text(installation.type, 'Instalacao');
    const site = this.text(installation.site);
    const lead = this.text(installation.lead);
    if (!clientId || !projectId || !type || !site || !lead) throw new BadRequestException('A instalacao precisa conter cliente, projeto, tipo, local e responsavel.');
    const installationId = this.text(installation.id) || `ins-${crypto.randomUUID()}`;
    if (expectedId && installationId !== expectedId) throw new BadRequestException('O identificador da instalacao nao confere.');

    const current = await this.readAggregate(cookie, 'gravacao de instalacoes');
    const installations = Array.isArray(current.data.installations) ? current.data.installations : [];
    const index = installations.findIndex((entry) => this.sameId(entry, expectedId || installationId));
    if (expectedId && index < 0) throw new NotFoundException('Instalacao nao encontrada.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe uma instalacao com este identificador.');
    const normalized = this.normalize(installation, expectedId || installationId);
    const nextInstallations = expectedId
      ? installations.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [...installations, normalized];
    return this.forward({ ...current.data, installations: nextInstallations }, input.baseRevision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de instalacoes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Installation[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalize(item, this.text(item.id, `legacy-installation-${index + 1}`)));
  }

  private normalize(item: RecordItem, id: string): Installation {
    return {
      ...item,
      id,
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      type: this.text(item.type, 'Instalacao'),
      site: this.text(item.site),
      lead: this.text(item.lead),
      stage: this.text(item.stage, 'Planejamento'),
      progress: this.percent(item.progress),
      due: this.text(item.due),
      status: this.text(item.status, 'Planejamento'),
    };
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private percent(value: unknown): number { const result = Number(value); return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : 0; }
}
