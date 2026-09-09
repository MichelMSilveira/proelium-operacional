import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

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
  private readonly pool?: Pool;

  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PGPOOL_MAX || 10),
        connectionTimeoutMillis: 5000,
      });
    }
  }

  async list(cookie?: string): Promise<{ articles: Article[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [articles, state] = await Promise.all([
      this.pool.query(
        `select id, author_username as "authorUsername", tag, title, summary, basis, extra_data as "extraData"
         from knowledge_domain_articles where company_id = $1 order by updated_at desc, title asc`,
        [context.companyId],
      ),
      this.pool.query('select revision from knowledge_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      articles: articles.rows.map((row) => this.articleFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de artigo invalido.');
    const input = body as { article?: unknown; baseRevision?: unknown };
    const article = this.record(input.article);
    if (!article) throw new BadRequestException('A gravacao precisa conter um artigo valido.');
    const title = this.text(article.title ?? article.name);
    if (!title) throw new BadRequestException('O artigo precisa conter um titulo.');
    const articleId = this.text(article.id, `art-next-${crypto.randomUUID()}`);
    if (expectedId && articleId !== expectedId) throw new BadRequestException('O identificador do artigo nao confere.');
    const baseRevision = this.revision(input.baseRevision);
    const normalized = {
      id: expectedId || articleId,
      authorUsername: this.text(article.authorUsername ?? article.author, context.username),
      tag: this.text(article.tag ?? article.category, 'Referencia tecnica'),
      title,
      summary: this.text(article.summary ?? article.description),
      basis: this.text(article.basis),
    };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== baseRevision) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from knowledge_domain_articles where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Artigo nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um artigo com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(article),
      };
      await client.query(
        `insert into knowledge_domain_articles
          (company_id, id, author_username, tag, title, summary, basis, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
         on conflict (company_id, id) do update set
           author_username = excluded.author_username, tag = excluded.tag, title = excluded.title,
           summary = excluded.summary, basis = excluded.basis, extra_data = excluded.extra_data,
           updated_at = now()`,
        [context.companyId, normalized.id, normalized.authorUsername, normalized.tag, normalized.title,
          normalized.summary, normalized.basis, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return {
        status: expectedId ? 200 : 201,
        body: JSON.stringify({ ok: true, revision: nextRevision, article: normalized }),
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(articleId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacyRemove(articleId, body, cookie);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!articleId.trim()) throw new BadRequestException('O identificador do artigo e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const deleted = await client.query(
        'delete from knowledge_domain_articles where company_id = $1 and id = $2 returning id',
        [context.companyId, articleId],
      );
      if (!deleted.rowCount) throw new NotFoundException('Artigo nao encontrado.');
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async authContext(cookie?: string): Promise<AuthContext> {
    if (!cookie) throw new UnauthorizedException('Sessao obrigatoria.');
    const upstream = await fetch(`${this.legacyOrigin}/api/auth/me`, { headers: { cookie } }).catch(() => {
      throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    });
    if (upstream.status === 401) throw new UnauthorizedException('Sessao expirada.');
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    const payload = await upstream.json() as { user?: RecordItem };
    const user = payload.user;
    if (!user) throw new UnauthorizedException('Sessao invalida.');
    const permissions = Array.isArray(user.permissions) ? user.permissions.map((item) => this.text(item)) : [];
    const modules = Array.isArray(user.modules) ? user.modules.map((item) => this.text(item)) : [];
    if (this.text(user.role) !== 'admin' && !permissions.includes('knowledge') && !modules.includes('knowledge')) {
      throw new ForbiddenException('Seu perfil nao possui acesso ao conhecimento.');
    }
    return {
      username: this.text(user.username, 'unknown'),
      companyId: this.text(user.companyId, 'legacy') || 'legacy',
      role: this.text(user.role, 'leitura'),
      permissions,
      modules,
    };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao') {
      throw new ForbiddenException('Seu perfil nao pode alterar a biblioteca de conhecimento.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:knowledge:${companyId}`]);
    const result = await client.query(
      'select revision from knowledge_domain_state where company_id = $1 for update',
      [companyId],
    );
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into knowledge_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update knowledge_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private articleFromRow(row: RecordItem): Article {
    const extra = this.record(row.extraData) || {};
    return {
      ...extra,
      id: this.text(row.id),
      authorUsername: this.text(row.authorUsername),
      tag: this.text(row.tag, 'Referencia tecnica'),
      title: this.text(row.title, 'Artigo sem titulo'),
      summary: this.text(row.summary),
      basis: this.text(row.basis),
    };
  }

  private extraData(article: RecordItem): RecordItem {
    const { id, authorUsername, author, tag, category, title, name, summary, description, basis, updatedAt, createdAt, ...extra } = article;
    void id; void authorUsername; void author; void tag; void category; void title; void name; void summary; void description; void basis; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ articles: Article[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do conhecimento.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar a biblioteca tecnica.');
    const payload = await upstream.json() as AggregateResponse;
    return { articles: this.normalizeList(payload.data?.articles), revision: payload.revision };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
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

  private async legacyRemove(articleId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
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
      const payload = JSON.parse(body) as AggregateResponse;
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
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-article-${index + 1}`),
      tag: this.text(item.tag ?? item.category, 'Referencia tecnica'),
      title: this.text(item.title ?? item.name, 'Artigo sem titulo'),
      summary: this.text(item.summary ?? item.description),
      basis: this.text(item.basis),
    }));
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
