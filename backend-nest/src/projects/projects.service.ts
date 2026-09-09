import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export type Project = { id: string; name: string; clientId: string; technicalStage: string; status: string; manager: string; progress: number; budget: number; [key: string]: unknown };

type Aggregate = { revision?: number; data?: Record<string, unknown> };
type RecordItem = Record<string, unknown>;
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

@Injectable()
export class ProjectsService {
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

  async list(cookie?: string): Promise<{ projects: Project[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [projects, state] = await Promise.all([
        this.pool.query(
          `select id, name, client_id as "clientId", technical_stage as "technicalStage", status, manager,
                  progress, budget, extra_data as "extraData"
           from projects_domain_entries where company_id = $1 order by updated_at desc, name asc`,
          [context.companyId],
        ),
        this.pool.query('select revision from projects_domain_state where company_id = $1', [context.companyId]),
      ]);
      return { projects: projects.rows.map((row) => this.projectFromRow(row)), revision: Number(state.rows[0]?.revision || 0) };
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de projetos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os projetos.');
    const payload = await upstream.json() as Aggregate;
    return { projects: this.normalizeList(payload.data?.projects), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { project?: unknown; baseRevision?: unknown };
    const project = this.record(input.project);
    if (!project) throw new BadRequestException('A gravacao precisa conter um projeto valido.');
    const projectId = String(project.id || '');
    if (!projectId) throw new BadRequestException('O projeto precisa conter identificador.');
    if (expectedId && projectId !== expectedId) throw new BadRequestException('O identificador do projeto nao confere.');

    const current = await this.readAggregate(cookie);
    const currentProjects = Array.isArray(current.data.projects) ? current.data.projects : [];
    const index = currentProjects.findIndex((item) => this.sameId(item, expectedId || projectId));
    if (expectedId && index < 0) throw new NotFoundException('Projeto nao encontrado.');
    const projects = expectedId
      ? currentProjects.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...project, id: expectedId } : item)
      : [...currentProjects, project];
    return this.forwardSave({ ...current.data, projects }, input.baseRevision, cookie);
  }

  async remove(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!expectedId) throw new BadRequestException('O identificador do projeto e obrigatorio.');
    if (this.pool) return this.databaseRemove(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const current = await this.readAggregate(cookie);
    const currentProjects = Array.isArray(current.data.projects) ? current.data.projects : [];
    if (!currentProjects.some((item) => this.sameId(item, expectedId))) throw new NotFoundException('Projeto nao encontrado.');
    return this.forwardSave({ ...current.data, projects: currentProjects.filter((item) => !this.sameId(item, expectedId)) }, input.baseRevision, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { project?: unknown; baseRevision?: unknown };
    const project = this.record(input.project);
    if (!project) throw new BadRequestException('A gravacao precisa conter um projeto valido.');
    const projectId = this.text(project.id);
    if (!projectId) throw new BadRequestException('O projeto precisa conter identificador.');
    if (expectedId && projectId !== expectedId) throw new BadRequestException('O identificador do projeto nao confere.');
    const normalized = this.normalizeProject(project, expectedId || projectId);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from projects_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Projeto nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um projeto com este identificador.');
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(project) };
      await client.query(
        `insert into projects_domain_entries
          (company_id, id, name, client_id, technical_stage, status, manager, progress, budget, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
         on conflict (company_id, id) do update set
           name = excluded.name, client_id = excluded.client_id, technical_stage = excluded.technical_stage,
           status = excluded.status, manager = excluded.manager, progress = excluded.progress,
           budget = excluded.budget, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.name, normalized.clientId, normalized.technicalStage, normalized.status,
          normalized.manager, normalized.progress, normalized.budget, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, project: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseRemove(body: unknown, cookie: string | undefined, expectedId: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const deleted = await client.query('delete from projects_domain_entries where company_id = $1 and id = $2 returning id', [context.companyId, expectedId]);
      if (!deleted.rowCount) throw new NotFoundException('Projeto nao encontrado.');
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, id: expectedId }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('projects') && !modules.includes('projects')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos projetos.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: this.text(user.role, 'leitura'), permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'operacao') throw new ForbiddenException('Seu perfil nao pode alterar projetos.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:projects:${companyId}`]);
    const result = await client.query('select revision from projects_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into projects_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update projects_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private projectFromRow(row: RecordItem): Project {
    return this.normalizeProject({ ...(this.record(row.extraData) || {}), id: row.id, name: row.name, clientId: row.clientId, technicalStage: row.technicalStage, status: row.status, manager: row.manager, progress: row.progress, budget: row.budget }, this.text(row.id));
  }

  private normalizeProject(item: RecordItem, id: string): Project {
    return {
      ...item,
      id,
      name: this.text(item.name ?? item.nome, 'Projeto sem nome'),
      clientId: this.text(item.clientId),
      technicalStage: this.text(item.technicalStage, 'Projeto tecnico'),
      status: this.text(item.status, 'Planejamento'),
      manager: this.text(item.manager),
      progress: this.percent(item.progress),
      budget: this.number(item.budget),
    };
  }

  private extraData(project: RecordItem): RecordItem {
    const { id, name, nome, clientId, technicalStage, status, manager, progress, budget, updatedAt, createdAt, ...extra } = project;
    void id; void name; void nome; void clientId; void technicalStage; void status; void manager; void progress; void budget; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de projetos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de projetos.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {} };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de projetos.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Project[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-project-${index + 1}`), name: this.text(item.name, 'Projeto sem nome'),
      clientId: this.text(item.clientId), technicalStage: this.text(item.technicalStage, 'Projeto tecnico'),
      status: this.text(item.status, 'Planejamento'), manager: this.text(item.manager),
      progress: this.percent(item.progress), budget: this.number(item.budget),
    }));
  }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
  private percent(value: unknown): number { return Math.min(100, this.number(value)); }
}
