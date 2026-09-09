import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

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

  async list(cookie?: string): Promise<{ articles: Article[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do conhecimento.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar a biblioteca tecnica.');
    const payload = await upstream.json() as { data?: { articles?: unknown }; revision?: number };
    return { articles: this.normalizeList(payload.data?.articles), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de artigo invalido.');
    const input = body as { article?: unknown; baseRevision?: unknown };
    const article = this.record(input.article);
    if (!article) throw new BadRequestException('A gravacao precisa conter um artigo valido.');
    const title = this.text(article.title ?? article.name);
    if (!title) throw new BadRequestException('O artigo precisa conter um titulo.');
    const current = await this.readAggregate(cookie);
    const articles = Array.isArray(current.data.articles) ? current.data.articles : [];
    const articleId = this.text(article.id, `art-next-${crypto.randomUUID()}`);
    const index = articles.findIndex((entry) => this.sameId(entry, expectedId || articleId));
    if (expectedId && index < 0) throw new NotFoundException('Artigo nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um artigo com este identificador.');
    const normalized = {
      ...article,
      id: expectedId || articleId,
      tag: this.text(article.tag ?? article.category, 'Referencia tecnica'),
      title,
      summary: this.text(article.summary ?? article.description),
      basis: this.text(article.basis),
      updatedAt: new Date().toISOString(),
    };
    const nextArticles = expectedId
      ? articles.map((entry, entryIndex) => entryIndex === index ? { ...this.record(entry), ...normalized, id: expectedId } : entry)
      : [normalized, ...articles];
    return this.forward({ ...current.data, articles: nextArticles }, input.baseRevision ?? current.revision, cookie);
  }

  async remove(articleId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!articleId.trim()) throw new BadRequestException('O identificador do artigo e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    const current = await this.readAggregate(cookie);
    const articles = Array.isArray(current.data.articles) ? current.data.articles : [];
    if (!articles.some((entry) => this.sameId(entry, articleId))) throw new NotFoundException('Artigo nao encontrado.');
    return this.forward({ ...current.data, articles: articles.filter((entry) => !this.sameId(entry, articleId)) }, input.baseRevision ?? current.revision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown>; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do conhecimento.');
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao do conhecimento.');
    try {
      const payload = JSON.parse(body) as { data?: Record<string, unknown>; revision?: number };
      return { data: payload.data || {}, revision: payload.revision };
    } catch {
      throw new ServiceUnavailableException('Resposta invalida do backend legado.');
    }
  }

  private async forward(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision, resource: 'knowledge' }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do conhecimento.');
    });
    return { status: upstream.status, body: await upstream.text() };
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

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
