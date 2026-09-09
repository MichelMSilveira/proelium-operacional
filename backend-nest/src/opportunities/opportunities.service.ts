import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type Aggregate = { revision?: number; data?: Record<string, unknown> };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };
type WorkflowResult = { ok: boolean; message?: string };
type CommercialWorkflow = { validate: (current: RecordItem, next: RecordItem) => WorkflowResult };

const commercialWorkflow = require('../../../commercial-workflow.js') as CommercialWorkflow;

export type Opportunity = {
  id: string;
  company: string;
  contact: string;
  stage: string;
  owner: string;
  source: string;
  nextAction: string;
  nextDue: string;
  estimatedValue: number;
  [key: string]: unknown;
};

@Injectable()
export class OpportunitiesService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';
  private readonly authOrigin = process.env.NEST_AUTH_ORIGIN || (process.env.DATABASE_URL ? `http://127.0.0.1:${process.env.PORT || 4174}` : this.legacyOrigin);
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

  async list(cookie?: string): Promise<{ opportunities: Opportunity[]; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [opportunities, state] = await Promise.all([
        this.pool.query(
          `select id, company, contact, phone, email, stage, owner, source, next_action as "nextAction",
                  next_due as "nextDue", estimated_value as "estimatedValue", loss_reason as "lossReason",
                  interests, needs, initial_scope as "initialScope", extra_data as "extraData"
           from opportunities_domain_entries where company_id = $1 order by updated_at desc, company asc`,
          [context.companyId],
        ),
        this.pool.query('select revision from opportunities_domain_state where company_id = $1', [context.companyId]),
      ]);
      return { opportunities: opportunities.rows.map((row) => this.opportunityFromRow(row)), revision: Number(state.rows[0]?.revision || 0) };
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de oportunidades.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar as oportunidades.');
    const payload = await upstream.json() as Aggregate;
    return { opportunities: this.normalizeList(payload.data?.opportunities), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseSave(body, cookie, expectedId);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { opportunity?: unknown; baseRevision?: unknown };
    const opportunity = this.record(input.opportunity);
    if (!opportunity) throw new BadRequestException('A gravacao precisa conter uma oportunidade valida.');
    const opportunityId = this.text(opportunity.id);
    if (!opportunityId) throw new BadRequestException('A oportunidade precisa conter identificador.');
    if (expectedId && opportunityId !== expectedId) throw new BadRequestException('O identificador da oportunidade nao confere.');
    const current = await this.readAggregate(cookie);
    const currentOpportunities = Array.isArray(current.data.opportunities) ? current.data.opportunities : [];
    const index = currentOpportunities.findIndex((item) => this.sameId(item, expectedId || opportunityId));
    if (expectedId && index < 0) throw new NotFoundException('Oportunidade nao encontrada.');
    const opportunities = expectedId
      ? currentOpportunities.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...opportunity, id: expectedId } : item)
      : [...currentOpportunities, opportunity];
    return this.forwardSave({ ...current.data, opportunities }, input.baseRevision, cookie);
  }

  async convert(opportunityId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!opportunityId.trim()) throw new BadRequestException('O identificador da oportunidade e obrigatorio.');
    if (this.pool) return this.databaseConvert(opportunityId, body, cookie);
    return this.legacyConvert(opportunityId, body, cookie);
  }

  private async databaseSave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravacao invalido.');
    const input = body as { opportunity?: unknown; baseRevision?: unknown };
    const opportunity = this.record(input.opportunity);
    if (!opportunity) throw new BadRequestException('A gravacao precisa conter uma oportunidade valida.');
    const opportunityId = this.text(opportunity.id);
    if (!opportunityId) throw new BadRequestException('A oportunidade precisa conter identificador.');
    if (expectedId && opportunityId !== expectedId) throw new BadRequestException('O identificador da oportunidade nao confere.');
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query('select id, extra_data as "extraData" from opportunities_domain_entries where company_id = $1 and id = $2', [context.companyId, expectedId || opportunityId]);
      if (expectedId && !existing.rowCount) throw new NotFoundException('Oportunidade nao encontrada.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe uma oportunidade com este identificador.');
      const currentRows = await client.query(
        `select id, company, contact, phone, email, stage, owner, source, next_action as "nextAction", next_due as "nextDue",
                estimated_value as "estimatedValue", loss_reason as "lossReason", interests, needs, initial_scope as "initialScope", extra_data as "extraData"
         from opportunities_domain_entries where company_id = $1 order by updated_at desc`,
        [context.companyId],
      );
      const currentOpportunities = currentRows.rows.map((row) => this.opportunityFromRow(row));
      const normalized = this.normalizeOpportunity(opportunity, expectedId || opportunityId);
      const nextOpportunities = expectedId
        ? currentOpportunities.map((item) => item.id === expectedId ? { ...item, ...normalized, id: expectedId } : item)
        : [normalized, ...currentOpportunities];
      const [surveyRows, pointRows, quoteRows, appointmentRows] = await Promise.all([
        client.query(
          `select id, opportunity_id as "opportunityId", status, extra_data as "extraData"
           from survey_domain_surveys where company_id = $1`,
          [context.companyId],
        ),
        client.query(
          `select id, survey_id as "surveyId", quantity, extra_data as "extraData"
           from survey_domain_points where company_id = $1`,
          [context.companyId],
        ),
        client.query(
          `select id, opportunity_id as "opportunityId", status, extra_data as "extraData"
           from quotes_domain_entries where company_id = $1`,
          [context.companyId],
        ),
        client.query(
          `select id, status, extra_data as "extraData"
           from appointments_domain_entries where company_id = $1`,
          [context.companyId],
        ),
      ]);
      const currentData = {
        opportunities: currentOpportunities,
        surveys: surveyRows.rows.map((row) => ({ ...(this.record(row.extraData) || {}), id: row.id, opportunityId: row.opportunityId, status: row.status })),
        surveyPoints: pointRows.rows.map((row) => ({ ...(this.record(row.extraData) || {}), id: row.id, surveyId: row.surveyId, quantity: row.quantity })),
        quotes: quoteRows.rows.map((row) => ({ ...(this.record(row.extraData) || {}), id: row.id, opportunityId: row.opportunityId, status: row.status })),
        appointments: appointmentRows.rows.map((row) => ({ ...(this.record(row.extraData) || {}), id: row.id, status: row.status })),
      };
      const nextData = { ...currentData, opportunities: nextOpportunities };
      const workflow = commercialWorkflow.validate(currentData, nextData);
      if (!workflow.ok) {
        await client.query('rollback');
        return { status: 422, body: JSON.stringify({ error: workflow.message || 'Transicao comercial invalida.' }) };
      }
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(opportunity) };
      await client.query(
        `insert into opportunities_domain_entries
          (company_id, id, company, contact, phone, email, stage, owner, source, next_action, next_due, estimated_value, loss_reason, interests, needs, initial_scope, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, now())
         on conflict (company_id, id) do update set
           company = excluded.company, contact = excluded.contact, phone = excluded.phone, email = excluded.email,
           stage = excluded.stage, owner = excluded.owner, source = excluded.source, next_action = excluded.next_action,
           next_due = excluded.next_due, estimated_value = excluded.estimated_value, loss_reason = excluded.loss_reason,
           interests = excluded.interests, needs = excluded.needs, initial_scope = excluded.initial_scope,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.company, normalized.contact, normalized.phone, normalized.email, normalized.stage,
          normalized.owner, normalized.source, normalized.nextAction, normalized.nextDue, normalized.estimatedValue, normalized.lossReason,
          normalized.interests, normalized.needs, normalized.initialScope, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, opportunity: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseConvert(opportunityId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const input = this.record(body) as { baseRevision?: unknown } | null;
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const opportunityRevision = await this.lockRevision(client, context.companyId);
      if (opportunityRevision !== this.revision(input?.baseRevision)) {
        await client.query('rollback');
        return this.conflict(opportunityRevision);
      }
      const opportunityResult = await client.query(
        `select id, company, contact, phone, email, stage, source, extra_data as "extraData"
         from opportunities_domain_entries where company_id = $1 and id = $2 for update`,
        [context.companyId, opportunityId],
      );
      const opportunityRow = opportunityResult.rows[0] as RecordItem | undefined;
      if (!opportunityRow) throw new NotFoundException('Oportunidade nao encontrada.');
      const opportunity = this.opportunityFromRow(opportunityRow);
      if (!['Orçamento', 'Ganho'].includes(opportunity.stage)) {
        throw new BadRequestException('Conclua o tratamento comercial até Orçamento antes de criar o cliente.');
      }
      const approvedQuote = await client.query(
        `select id from quotes_domain_entries
         where company_id = $1 and opportunity_id = $2 and status = 'Aprovado' limit 1`,
        [context.companyId, opportunityId],
      );
      if (!approvedQuote.rowCount) throw new BadRequestException('O cliente só é criado após a aprovação de um orçamento.');

      const clientsRevision = await this.lockDomainRevision(client, 'clients_domain_state', 'proelium:clients', context.companyId);
      const existingClient = await client.query(
        `select id from clients_domain_entries
         where company_id = $1 and lower(name) = lower($2) limit 1`,
        [context.companyId, opportunity.company],
      );
      let clientId = this.text(existingClient.rows[0]?.id);
      let clientCreated = false;
      if (!clientId) {
        clientId = `cli-${crypto.randomUUID()}`;
        const extraData = {
          contact: opportunity.contact,
          city: '',
          notes: `Origem: oportunidade comercial (${opportunity.source || 'nao informada'}).`,
          status: 'Potencial',
        };
        await client.query(
          `insert into clients_domain_entries
            (company_id, id, name, document, email, phone, address, extra_data, updated_at)
           values ($1, $2, $3, '', $4, $5, '', $6::jsonb, now())`,
          [context.companyId, clientId, opportunity.company, opportunity.email, opportunity.phone, JSON.stringify(extraData)],
        );
        clientCreated = true;
      }
      await client.query(
        `update opportunities_domain_entries
         set stage = 'Ganho', loss_reason = '', updated_at = now()
         where company_id = $1 and id = $2`,
        [context.companyId, opportunityId],
      );
      const nextOpportunityRevision = await this.bumpRevision(client, context.companyId);
      const nextClientsRevision = clientCreated
        ? await this.bumpDomainRevision(client, 'clients_domain_state', context.companyId)
        : clientsRevision;
      await client.query('commit');
      return {
        status: 200,
        body: JSON.stringify({ ok: true, opportunityId, clientId, clientCreated, opportunityRevision: nextOpportunityRevision, clientsRevision: nextClientsRevision }),
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async legacyConvert(opportunityId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const input = this.record(body) as { baseRevision?: unknown } | null;
    const current = await this.readAggregate(cookie);
    const opportunities = Array.isArray(current.data.opportunities) ? current.data.opportunities : [];
    const opportunityIndex = opportunities.findIndex((item) => this.sameId(item, opportunityId));
    if (opportunityIndex < 0) throw new NotFoundException('Oportunidade nao encontrada.');
    const opportunity = this.record(opportunities[opportunityIndex]) || {};
    if (!['Orçamento', 'Ganho'].includes(this.text(opportunity.stage))) {
      throw new BadRequestException('Conclua o tratamento comercial até Orçamento antes de criar o cliente.');
    }
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    if (!quotes.some((item) => {
      const quote = this.record(item);
      return this.text(quote?.opportunityId) === opportunityId && this.text(quote?.status) === 'Aprovado';
    })) throw new BadRequestException('O cliente só é criado após a aprovação de um orçamento.');
    const clients = Array.isArray(current.data.clients) ? current.data.clients : [];
    const company = this.text(opportunity.company);
    const existing = clients.find((item) => this.text(this.record(item)?.name).toLowerCase() === company.toLowerCase());
    const nextClients = existing ? clients : [...clients, {
      id: `cli-${crypto.randomUUID()}`,
      name: company,
      document: '',
      contact: this.text(opportunity.contact),
      email: this.text(opportunity.email),
      phone: this.text(opportunity.phone),
      address: '',
      city: '',
      notes: `Origem: oportunidade comercial (${this.text(opportunity.source, 'nao informada')}).`,
      status: 'Potencial',
    }];
    const nextOpportunities = opportunities.map((item, index) => index === opportunityIndex ? { ...opportunity, stage: 'Ganho', lossReason: '' } : item);
    return this.forwardSave(
      { ...current.data, opportunities: nextOpportunities, clients: nextClients },
      input?.baseRevision ?? current.revision,
      cookie,
    );
  }

  private async authContext(cookie?: string): Promise<AuthContext> {
    if (!cookie) throw new UnauthorizedException('Sessao obrigatoria.');
    const upstream = await fetch(`${this.authOrigin}/api/auth/me`, { headers: { cookie } }).catch(() => {
      throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    });
    if (upstream.status === 401) throw new UnauthorizedException('Sessao expirada.');
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel validar a sessao.');
    const payload = await upstream.json() as { user?: RecordItem };
    const user = payload.user;
    if (!user) throw new UnauthorizedException('Sessao invalida.');
    const permissions = Array.isArray(user.permissions) ? user.permissions.map((item) => this.text(item)) : [];
    const modules = Array.isArray(user.modules) ? user.modules.map((item) => this.text(item)) : [];
    const role = this.text(user.role);
    if (role !== 'admin' && !permissions.includes('*') && !permissions.includes('commercial') && !modules.includes('commercial')) {
      throw new ForbiddenException('Seu perfil nao possui acesso ao comercial.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: role || 'leitura', permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'comercial') throw new ForbiddenException('Seu perfil nao pode alterar oportunidades.');
  }

  private async lockDomainRevision(client: PoolClient, table: string, lockKey: string, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${lockKey}:${companyId}`]);
    const result = await client.query(`select revision from ${table} where company_id = $1 for update`, [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query(`insert into ${table} (company_id, revision) values ($1, 0)`, [companyId]);
    return 0;
  }

  private async bumpDomainRevision(client: PoolClient, table: string, companyId: string): Promise<number> {
    const result = await client.query(`update ${table} set revision = revision + 1, updated_at = now() where company_id = $1 returning revision`, [companyId]);
    return Number(result.rows[0].revision);
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:opportunities:${companyId}`]);
    const result = await client.query('select revision from opportunities_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into opportunities_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update opportunities_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown>; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de oportunidades.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de oportunidades.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {}, revision: payload.revision };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao de oportunidades.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private opportunityFromRow(row: RecordItem): Opportunity {
    return this.normalizeOpportunity({ ...(this.record(row.extraData) || {}), id: row.id, company: row.company, contact: row.contact, phone: row.phone, email: row.email, stage: row.stage, owner: row.owner, source: row.source, nextAction: row.nextAction, nextDue: row.nextDue, estimatedValue: row.estimatedValue, lossReason: row.lossReason, interests: row.interests, needs: row.needs, initialScope: row.initialScope }, this.text(row.id));
  }

  private normalizeOpportunity(item: RecordItem, id: string): Opportunity {
    return {
      ...item,
      id,
      company: this.text(item.company),
      contact: this.text(item.contact),
      phone: this.text(item.phone),
      email: this.text(item.email),
      stage: this.text(item.stage, 'Novo contato'),
      owner: this.text(item.owner),
      source: this.text(item.source),
      nextAction: this.text(item.nextAction),
      nextDue: this.text(item.nextDue),
      estimatedValue: this.number(item.estimatedValue),
      lossReason: this.text(item.lossReason),
      interests: this.text(item.interests),
      needs: this.text(item.needs),
      initialScope: this.text(item.initialScope),
    };
  }

  private extraData(item: RecordItem): RecordItem {
    const { id, company, contact, phone, email, stage, owner, source, nextAction, nextDue, estimatedValue, lossReason, interests, needs, initialScope, updatedAt, createdAt, ...extra } = item;
    void id; void company; void contact; void phone; void email; void stage; void owner; void source; void nextAction; void nextDue; void estimatedValue; void lossReason; void interests; void needs; void initialScope; void updatedAt; void createdAt;
    return extra;
  }

  private normalizeList(value: unknown): Opportunity[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeOpportunity(item, this.text(item.id, `legacy-opportunity-${index + 1}`)));
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
