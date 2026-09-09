import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type Client = {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  [key: string]: unknown;
};

type Aggregate = { revision?: number; data?: Record<string, unknown> };

@Injectable()
export class ClientsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ clients: Client[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de clientes.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os clientes.');
    const payload = await upstream.json() as Aggregate;
    return { clients: this.normalizeList(payload.data?.clients), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { client?: unknown; baseRevision?: unknown };
    const client = this.record(input.client);
    if (!client) throw new BadRequestException('A gravacao precisa conter um cliente valido.');
    const clientId = String(client.id || '');
    if (!clientId) throw new BadRequestException('O cliente precisa conter identificador.');
    if (expectedId && clientId !== expectedId) throw new BadRequestException('O identificador do cliente nao confere.');

    const current = await this.readAggregate(cookie);
    const currentClients = Array.isArray(current.data?.clients) ? current.data.clients : [];
    const index = currentClients.findIndex((item) => this.sameId(item, expectedId || clientId));
    if (expectedId && index < 0) throw new NotFoundException('Cliente nao encontrado.');
    const clients = expectedId
      ? currentClients.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...client, id: expectedId } : item)
      : [...currentClients, client];
    return this.forwardSave({ ...current.data, clients }, input.baseRevision, cookie);
  }

  async remove(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!expectedId) throw new BadRequestException('O identificador do cliente e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const current = await this.readAggregate(cookie);
    const currentClients = Array.isArray(current.data?.clients) ? current.data.clients : [];
    if (!currentClients.some((item) => this.sameId(item, expectedId))) throw new NotFoundException('Cliente nao encontrado.');
    return this.forwardSave({ ...current.data, clients: currentClients.filter((item) => !this.sameId(item, expectedId)) }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de clientes.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de clientes.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de clientes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Client[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item, index) => ({
        ...item,
        id: this.text(item.id, `legacy-client-${index + 1}`),
        name: this.text(item.name, 'Cliente sem nome'),
        document: this.text(item.document), email: this.text(item.email),
        phone: this.text(item.phone), address: this.text(item.address),
      }));
  }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
