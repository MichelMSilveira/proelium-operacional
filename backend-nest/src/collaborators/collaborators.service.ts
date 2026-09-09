import { Injectable, ServiceUnavailableException } from '@nestjs/common';

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

  async list(cookie?: string): Promise<Collaborator[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de colaboradores.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os colaboradores.');
    const payload = await upstream.json() as { data?: { collaborators?: unknown } };
    return this.normalizeList(payload.data?.collaborators);
  }

  private normalizeList(value: unknown): Collaborator[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-collaborator-${index + 1}`),
      name: this.text(item.name, 'Colaborador sem nome'),
      role: this.text(item.role),
      specialty: this.text(item.specialty),
      relationship: this.text(item.relationship),
      availability: this.text(item.availability),
      compensation: this.text(item.compensation),
      status: this.text(item.status, 'Ativo'),
    }));
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
