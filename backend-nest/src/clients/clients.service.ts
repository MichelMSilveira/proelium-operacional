import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Client = {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  [key: string]: unknown;
};

@Injectable()
export class ClientsService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Client[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de clientes.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os clientes.');
    const payload = await upstream.json() as { data?: { clients?: unknown } };
    return this.normalizeList(payload.data?.clients);
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

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
