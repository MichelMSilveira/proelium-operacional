import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Article = {
  id: string;
  tag: string;
  title: string;
  summary: string;
  basis: string;
  [key: string]: unknown;
};

@Injectable()
export class KnowledgeService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Article[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do conhecimento.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar a biblioteca tecnica.');
    const payload = await upstream.json() as { data?: { articles?: unknown } };
    return this.normalizeList(payload.data?.articles);
  }

  private normalizeList(value: unknown): Article[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-article-${index + 1}`),
      tag: this.text(item.tag ?? item.category, 'Referencia tecnica'),
      title: this.text(item.title ?? item.name, 'Artigo sem titulo'),
      summary: this.text(item.summary ?? item.description),
      basis: this.text(item.basis),
    }));
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
