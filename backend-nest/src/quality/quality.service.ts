import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Evaluation = { id: string; projectId: string; source: string; evaluator: string; collaborator: string; installation: number; service: number; commitment: number; deadline: number; note: string; date: string; [key: string]: unknown };

@Injectable()
export class QualityService {
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

  async list(cookie?: string): Promise<{ evaluations: Evaluation[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [evaluations, state] = await Promise.all([
      this.pool.query(
        `select id, project_id as "projectId", source, evaluator, collaborator, installation, service,
                commitment, deadline, note, evaluation_date::text as date, extra_data as "extraData"
         from quality_domain_evaluations where company_id = $1 order by evaluation_date desc, created_at desc`,
        [context.companyId],
      ),
      this.pool.query('select revision from quality_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      evaluations: evaluations.rows.map((row) => this.evaluationFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async save(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de avaliacao invalido.');
    const input = body as { evaluation?: unknown; baseRevision?: unknown };
    const evaluation = this.record(input.evaluation);
    if (!evaluation) throw new BadRequestException('Avaliacao invalida.');
    const projectId = this.text(evaluation.projectId);
    const source = this.text(evaluation.source, 'Interna');
    const evaluator = this.text(evaluation.evaluator);
    const collaborator = this.text(evaluation.collaborator);
    if (!projectId || !evaluator || !collaborator) throw new BadRequestException('A avaliacao precisa conter projeto, avaliador e pessoa avaliada.');
    if (!['Interna', 'Cliente'].includes(source)) throw new BadRequestException('A fonte da avaliacao deve ser Interna ou Cliente.');
    const scores = ['installation', 'service', 'commitment', 'deadline'].map((key) => this.integerScore(evaluation[key]));
    if (scores.some((value) => value < 1 || value > 5)) throw new BadRequestException('As quatro notas devem estar entre 1 e 5.');
    const date = this.date(evaluation.date, new Date().toISOString().slice(0, 10));
    const normalized = {
      id: this.text(evaluation.id) || `eva-${crypto.randomUUID()}`,
      projectId,
      source,
      evaluator,
      collaborator,
      installation: scores[0],
      service: scores[1],
      commitment: scores[2],
      deadline: scores[3],
      note: this.text(evaluation.note),
      date,
    };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id from quality_domain_evaluations where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (existing.rowCount) throw new BadRequestException('Ja existe uma avaliacao com este identificador.');
      await client.query(
        `insert into quality_domain_evaluations
          (company_id, id, project_id, source, evaluator, collaborator, installation, service, commitment, deadline, note, evaluation_date, extra_data)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13::jsonb)`,
        [context.companyId, normalized.id, normalized.projectId, normalized.source, normalized.evaluator, normalized.collaborator,
          normalized.installation, normalized.service, normalized.commitment, normalized.deadline, normalized.note, normalized.date,
          JSON.stringify(this.extraData(evaluation))],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 201, body: JSON.stringify({ ok: true, revision: nextRevision, evaluation: normalized }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('quality') && !modules.includes('quality')) {
      throw new ForbiddenException('Seu perfil nao possui acesso a qualidade.');
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
      throw new ForbiddenException('Seu perfil nao pode registrar avaliacoes de qualidade.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:quality:${companyId}`]);
    const result = await client.query('select revision from quality_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into quality_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update quality_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private evaluationFromRow(row: RecordItem): Evaluation {
    return {
      ...(this.record(row.extraData) || {}),
      id: this.text(row.id),
      projectId: this.text(row.projectId),
      source: this.text(row.source, 'Interna'),
      evaluator: this.text(row.evaluator),
      collaborator: this.text(row.collaborator),
      installation: this.integerScore(row.installation),
      service: this.integerScore(row.service),
      commitment: this.integerScore(row.commitment),
      deadline: this.integerScore(row.deadline),
      note: this.text(row.note),
      date: this.text(row.date),
    };
  }

  private extraData(evaluation: RecordItem): RecordItem {
    const { id, projectId, source, evaluator, collaborator, installation, service, commitment, deadline, note, date, updatedAt, createdAt, ...extra } = evaluation;
    void id; void projectId; void source; void evaluator; void collaborator; void installation; void service; void commitment; void deadline; void note; void date; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ evaluations: Evaluation[]; revision?: number }> {
    const current = await this.readAggregate(cookie, 'leitura das avaliacoes');
    return { evaluations: this.normalizeList(current.data.evaluations), revision: current.revision };
  }

  private async legacySave(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de avaliacao invalido.');
    const input = body as { evaluation?: unknown; baseRevision?: unknown };
    const evaluation = this.record(input.evaluation);
    if (!evaluation) throw new BadRequestException('Avaliacao invalida.');
    const projectId = this.text(evaluation.projectId);
    const source = this.text(evaluation.source, 'Interna');
    const evaluator = this.text(evaluation.evaluator);
    const collaborator = this.text(evaluation.collaborator);
    if (!projectId || !evaluator || !collaborator) throw new BadRequestException('A avaliacao precisa conter projeto, avaliador e pessoa avaliada.');
    if (!['Interna', 'Cliente'].includes(source)) throw new BadRequestException('A fonte da avaliacao deve ser Interna ou Cliente.');
    const scores = ['installation', 'service', 'commitment', 'deadline'].map((key) => this.integerScore(evaluation[key]));
    if (scores.some((value) => value < 1 || value > 5)) throw new BadRequestException('As quatro notas devem estar entre 1 e 5.');
    const current = await this.readAggregate(cookie, 'gravacao da avaliacao');
    const evaluations = Array.isArray(current.data.evaluations) ? current.data.evaluations : [];
    const normalized = {
      ...evaluation,
      id: this.text(evaluation.id) || `eva-${crypto.randomUUID()}`,
      projectId, source, evaluator, collaborator,
      installation: scores[0], service: scores[1], commitment: scores[2], deadline: scores[3],
      note: this.text(evaluation.note), date: this.date(evaluation.date, new Date().toISOString().slice(0, 10)),
    };
    return this.forward({ ...current.data, evaluations: [normalized, ...evaluations] }, input.baseRevision, cookie);
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de avaliacoes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Evaluation[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-evaluation-${index + 1}`),
      projectId: this.text(item.projectId), source: this.text(item.source, 'Interna'), evaluator: this.text(item.evaluator), collaborator: this.text(item.collaborator),
      installation: this.integerScore(item.installation), service: this.integerScore(item.service), commitment: this.integerScore(item.commitment), deadline: this.integerScore(item.deadline),
      note: this.text(item.note), date: this.text(item.date),
    }));
  }

  private record(value: unknown): RecordItem | null { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null; }
  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private integerScore(value: unknown): number { const result = Number(value); return Number.isInteger(result) ? result : 0; }
  private date(value: unknown, fallback: string): string { const result = this.text(value, fallback); return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : fallback; }
}
