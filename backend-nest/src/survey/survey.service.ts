import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

const surveyQuoteMapper = require('../../../commercial-workflow.js') as {
  populateQuoteFromSurvey: (data: Record<string, unknown>, surveyId: string, quoteId: string, makeId?: (prefix: string) => string) => { added: number; updated: number; unmapped: Array<Record<string, unknown>>; value: number };
  ensurePreProjectFromQuote: (data: Record<string, unknown>, surveyId: string, quoteId: string, makeId?: (prefix: string) => string) => { project: Record<string, unknown> | null; created: boolean; updated: boolean; cost: number };
};
const technicalDimensioning = require('../../../technical-dimensioning.js') as {
  dimensionSurvey: (survey: Record<string, unknown>, points: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Record<string, unknown>;
};
const technicalCompatibility = require('../../../technical-compatibility.js') as {
  findCompatibleProducts: (dimensioning: Record<string, unknown>, products: Array<Record<string, unknown>>) => Record<string, unknown>;
};

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

export type Survey = { id: string; opportunityId: string; title: string; status: string; [key: string]: unknown };
export type SurveyPoint = { id: string; surveyId: string; name: string; type: string; [key: string]: unknown };
export type SurveyRoom = { id: string; surveyId: string; name: string; [key: string]: unknown };

@Injectable()
export class SurveyService {
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

  async list(cookie?: string): Promise<{ surveys: Survey[]; points: SurveyPoint[]; rooms: SurveyRoom[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const snapshot = await this.directSnapshot(context.companyId);
    return { ...snapshot, revision: snapshot.revision };
  }

  async rooms(surveyId: string, cookie?: string): Promise<{ rooms: SurveyRoom[]; revision?: number }> {
    if (!surveyId.trim()) throw new BadRequestException('O identificador do levantamento e obrigatorio.');
    if (!this.pool) {
      const current = await this.readAggregate(cookie);
      const surveys = Array.isArray(current.data.surveys) ? current.data.surveys : [];
      if (!surveys.some((item) => this.sameId(item, surveyId))) throw new NotFoundException('Levantamento nao encontrado.');
      return { rooms: this.normalizeRooms(current.data.surveyRooms).filter((room) => room.surveyId === surveyId), revision: current.revision };
    }
    const context = await this.authContext(cookie);
    const result = await this.pool.query(
      `select id, survey_id as "surveyId", name, extra_data as "extraData"
       from survey_domain_rooms where company_id = $1 and survey_id = $2 order by updated_at desc, name asc`,
      [context.companyId, surveyId],
    );
    const survey = await this.pool.query('select id from survey_domain_surveys where company_id = $1 and id = $2', [context.companyId, surveyId]);
    if (!survey.rowCount) throw new NotFoundException('Levantamento nao encontrado.');
    const state = await this.pool.query('select revision from survey_domain_state where company_id = $1', [context.companyId]);
    return { rooms: result.rows.map((row) => this.roomFromRow(row)), revision: Number(state.rows[0]?.revision || 0) };
  }

  async dimensioning(surveyId: string, cookie?: string): Promise<Record<string, unknown>> {
    if (!surveyId.trim()) throw new BadRequestException('O identificador do levantamento e obrigatorio.');
    if (!this.pool) {
      const current = await this.readAggregate(cookie);
      const surveys = this.normalizeSurveys(current.data?.surveys);
      const survey = surveys.find((item) => this.sameId(item, surveyId));
      if (!survey) throw new NotFoundException('Levantamento nao encontrado.');
      const points = this.normalizePoints(current.data?.surveyPoints).filter((point) => point.surveyId === surveyId);
      const dimensioning = technicalDimensioning.dimensionSurvey(survey, points);
      const products = Array.isArray(current.data?.products) ? current.data.products.map((item) => this.record(item)).filter((item): item is RecordItem => Boolean(item)) : [];
      return { surveyId, dimensioning, compatibility: technicalCompatibility.findCompatibleProducts(dimensioning, products) };
    }
    const context = await this.authContext(cookie);
    const snapshot = await this.directSnapshot(context.companyId);
    const survey = snapshot.surveys.find((item) => item.id === surveyId);
    if (!survey) throw new NotFoundException('Levantamento nao encontrado.');
    const points = snapshot.points.filter((point) => point.surveyId === surveyId);
    const productsResult = await this.pool.query(
      `select id, catalog_type as "catalogType", name, sku, category, active, extra_data as "extraData"
       from products_domain_entries where company_id = $1 order by updated_at desc, name asc`,
      [context.companyId],
    );
    const products = productsResult.rows.map((row) => ({ ...(this.record(row.extraData) || {}), id: this.text(row.id), catalogType: this.text(row.catalogType), name: this.text(row.name), sku: this.text(row.sku), category: this.text(row.category), active: row.active !== false }));
    const dimensioning = technicalDimensioning.dimensionSurvey(survey, points);
    return { surveyId, dimensioning, compatibility: technicalCompatibility.findCompatibleProducts(dimensioning, products) };
  }

  async saveRooms(surveyId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySaveRooms(surveyId, body, cookie);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!surveyId.trim()) throw new BadRequestException('O identificador do levantamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ambientes invalido.');
    const input = body as { rooms?: unknown; baseRevision?: unknown };
    if (!Array.isArray(input.rooms)) throw new BadRequestException('A gravacao precisa conter rooms como lista.');
    const rooms = input.rooms.map((item, index) => {
      const room = this.record(item);
      if (!room || this.text(room.surveyId, surveyId) !== surveyId) throw new BadRequestException('Todos os ambientes precisam pertencer ao levantamento informado.');
      const name = this.text(room.name);
      if (!name) throw new BadRequestException('Todo ambiente precisa conter nome.');
      return { ...room, id: this.text(room.id, `room-${crypto.randomUUID()}-${index}`), surveyId, name };
    });
    if (new Set(rooms.map((room) => room.name.toLocaleLowerCase())).size !== rooms.length) throw new BadRequestException('Nao e permitido repetir ambiente no levantamento.');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const survey = await client.query('select id from survey_domain_surveys where company_id = $1 and id = $2', [context.companyId, surveyId]);
      if (!survey.rowCount) throw new NotFoundException('Levantamento nao encontrado.');
      const currentRooms = await client.query(
        'select id, name, extra_data as "extraData" from survey_domain_rooms where company_id = $1 and survey_id = $2',
        [context.companyId, surveyId],
      );
      const points = await client.query(
        'select id, room, room_id as "roomId" from survey_domain_points where company_id = $1 and survey_id = $2',
        [context.companyId, surveyId],
      );
      for (const point of points.rows) {
        const previous = currentRooms.rows.find((room) => room.id === this.text(point.roomId) || room.name === this.text(point.room));
        const next = previous ? rooms.find((room) => room.id === previous.id) : undefined;
        if (previous && next && previous.name !== next.name) {
          await client.query(
            'update survey_domain_points set room = $1, room_id = $2, updated_at = now() where company_id = $3 and id = $4',
            [next.name, next.id, context.companyId, point.id],
          );
        }
      }
      await client.query('delete from survey_domain_rooms where company_id = $1 and survey_id = $2', [context.companyId, surveyId]);
      for (const room of rooms) {
        const previous = currentRooms.rows.find((item) => item.id === room.id);
        await client.query(
          `insert into survey_domain_rooms (company_id, id, survey_id, name, extra_data, updated_at)
           values ($1, $2, $3, $4, $5::jsonb, now())`,
          [context.companyId, room.id, surveyId, room.name, JSON.stringify({ ...(this.record(previous?.extraData) || {}), ...this.extraData(room) })],
        );
      }
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, rooms }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async sendToQuote(surveyId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySendToQuote(surveyId, body, cookie);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    return this.databaseSendToQuote(surveyId, body, context);
  }

  private async databaseSendToQuote(surveyId: string, body: unknown, context: AuthContext): Promise<{ status: number; body: string }> {
    if (!surveyId.trim()) throw new BadRequestException('O identificador do levantamento e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    const baseRevision = this.revision(input.baseRevision);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== baseRevision) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const surveyResult = await client.query(
        `select id, opportunity_id as "opportunityId", title, site, source, status, notes, extra_data as "extraData"
         from survey_domain_surveys where company_id = $1 and id = $2`,
        [context.companyId, surveyId],
      );
      const survey = surveyResult.rows[0] as RecordItem | undefined;
      if (!survey) throw new NotFoundException('Levantamento nao encontrado.');
      const pointsResult = await client.query(
        `select id, survey_id as "surveyId", room, room_id as "roomId", type, technology, quantity, status, notes, extra_data as "extraData"
         from survey_domain_points where company_id = $1 and survey_id = $2`,
        [context.companyId, surveyId],
      );
      const roomsResult = await client.query(
        `select id, survey_id as "surveyId", name, extra_data as "extraData"
         from survey_domain_rooms where company_id = $1 and survey_id = $2`,
        [context.companyId, surveyId],
      );
      const points = pointsResult.rows.map((row) => this.pointFromRow(row));
      const surveyStatus = this.text(survey.status);
      if (!['Validado', 'Enviado ao orçamento'].includes(surveyStatus) || !points.some((item) => this.number(item.quantity) > 0)) {
        throw new BadRequestException('Valide o levantamento e registre ao menos um ponto ou quantitativo antes de envia-lo ao orcamento.');
      }

      const opportunityRevision = await this.lockDomainRevision(client, 'opportunities_domain_state', 'proelium:opportunities', context.companyId);
      const opportunityResult = await client.query(
        `select id, company, stage, extra_data as "extraData"
         from opportunities_domain_entries where company_id = $1 and id = $2`,
        [context.companyId, this.text(survey.opportunityId)],
      );
      const opportunity = opportunityResult.rows[0] as RecordItem | undefined;
      if (!opportunity) throw new BadRequestException('Vincule este levantamento a uma oportunidade antes de criar o orcamento.');

      const quotesRevision = await this.lockDomainRevision(client, 'quotes_domain_state', 'proelium:quotes', context.companyId);
      const quoteResult = await client.query(
        `select id, opportunity_id as "opportunityId", client_id as "clientId", title, status, value, extra_data as "extraData"
         from quotes_domain_entries where company_id = $1 and opportunity_id = $2 and status <> 'Aprovado'
         order by updated_at desc limit 1`,
        [context.companyId, this.text(opportunity.id)],
      );
      let quote = quoteResult.rows[0] as RecordItem | undefined;
      let opportunityChanged = false;
      if (!quote) {
        quote = {
          id: `orc-${crypto.randomUUID()}`,
          opportunityId: this.text(opportunity.id),
          clientId: '',
          title: `Proposta — ${this.text(opportunity.company, 'Cliente')}`,
          value: 0,
          status: 'Em elaboração',
          extraData: { technicalSurveyId: surveyId },
        };
        await client.query(
          `insert into quotes_domain_entries
            (company_id, id, opportunity_id, client_id, title, status, value, extra_data, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
          [context.companyId, quote.id, quote.opportunityId, quote.clientId, quote.title, quote.status, quote.value, JSON.stringify(quote.extraData)],
        );
        opportunityChanged = true;
      } else if (!this.text(this.record(quote.extraData)?.technicalSurveyId)) {
        const extraData = { ...(this.record(quote.extraData) || {}), technicalSurveyId: surveyId };
        await client.query(
          'update quotes_domain_entries set extra_data = $1::jsonb, updated_at = now() where company_id = $2 and id = $3',
          [JSON.stringify(extraData), context.companyId, quote.id],
        );
      }
      if (opportunityChanged) {
        await client.query(
          `update opportunities_domain_entries set stage = 'Orçamento', updated_at = now()
           where company_id = $1 and id = $2`,
          [context.companyId, opportunity.id],
        );
      }

      const surveyRooms = roomsResult.rows.map((row) => this.roomFromRow(row));
      const roomNames = [...new Set([
        ...surveyRooms.map((room) => room.name),
        ...points.map((item) => this.text(item.room)),
      ].filter(Boolean))];
      const quoteRoomsResult = await client.query(
        `select id, quote_id as "quoteId", name, items, extra_data as "extraData"
         from quotes_domain_rooms where company_id = $1 and quote_id = $2`,
        [context.companyId, quote.id],
      );
      const quoteRooms = quoteRoomsResult.rows.map((row) => ({ ...row, items: Array.isArray(row.items) ? row.items : [] })) as RecordItem[];
      const existingNames = quoteRooms.map((row) => this.text(row.name));
      const missing = roomNames.filter((name) => !existingNames.includes(name));
      for (const name of missing) {
        const source = surveyRooms.find((room) => room.name === name);
        const room = { id: `amb-${crypto.randomUUID()}`, quoteId: quote.id, technicalSurveyId: surveyId, surveyRoomId: source?.id || '', name, items: [] };
        quoteRooms.push(room);
        await client.query(
          `insert into quotes_domain_rooms (company_id, id, quote_id, name, items, extra_data, updated_at)
           values ($1, $2, $3, $4, '[]'::jsonb, $5::jsonb, now())`,
          [context.companyId, room.id, quote.id, name, JSON.stringify({ technicalSurveyId: surveyId, surveyRoomId: source?.id || '' })],
        );
      }
      const productsResult = await client.query(
        `select id, catalog_type as "catalogType", name, sku, category, unit, price, active, extra_data as "extraData"
         from products_domain_entries where company_id = $1`,
        [context.companyId],
      );
      const products = productsResult.rows.map((row) => ({ ...(this.record(row.extraData) || {}), id: this.text(row.id), catalogType: this.text(row.catalogType), name: this.text(row.name), sku: this.text(row.sku), category: this.text(row.category), unit: this.text(row.unit, 'un'), price: this.number(row.price), active: row.active !== false }));
      const projectsResult = await client.query(
        `select id, name, client_id as "clientId", technical_stage as "technicalStage", status, manager, progress, budget, extra_data as "extraData"
         from projects_domain_entries where company_id = $1
           and (extra_data->>'quoteId' = $2 or extra_data->>'technicalSurveyId' = $3)
         order by updated_at desc limit 1`,
        [context.companyId, quote.id, surveyId],
      );
      const projects = projectsResult.rows.map((row) => ({ ...(this.record(row.extraData) || {}), ...row, id: this.text(row.id), clientId: this.text(row.clientId), technicalStage: this.text(row.technicalStage, 'Projeto técnico'), status: this.text(row.status, 'Planejamento'), manager: this.text(row.manager, 'A definir'), progress: this.number(row.progress), budget: this.number(row.budget) }));
      const mappingData = { products, surveys: [survey], surveyPoints: points, surveyRooms, quoteRooms, quotes: [quote], projects };
      const mapping = surveyQuoteMapper.populateQuoteFromSurvey(mappingData, surveyId, this.text(quote.id), prefix => `${prefix}-${crypto.randomUUID()}`);
      const preparation = surveyQuoteMapper.ensurePreProjectFromQuote(mappingData, surveyId, this.text(quote.id), prefix => `${prefix}-${crypto.randomUUID()}`);
      quote.value = mapping.value;
      quote.extraData = { ...(this.record(quote.extraData) || {}), technicalSurveyId: surveyId, surveyMapping: quote.surveyMapping };
      for (const room of quoteRooms) {
        await client.query(
          'update quotes_domain_rooms set items = $1::jsonb, extra_data = $2::jsonb, updated_at = now() where company_id = $3 and id = $4',
          [JSON.stringify(Array.isArray(room.items) ? room.items : []), JSON.stringify({ ...(this.record(room.extraData) || {}), technicalSurveyId: surveyId }), context.companyId, room.id],
        );
      }
      await client.query(
        'update quotes_domain_entries set value = $1, extra_data = $2::jsonb, updated_at = now() where company_id = $3 and id = $4',
        [mapping.value, JSON.stringify(quote.extraData), context.companyId, quote.id],
      );
      let nextProjectsRevision: number | undefined;
      if (preparation.project && (preparation.created || preparation.updated)) {
        await this.lockDomainRevision(client, 'projects_domain_state', 'proelium:projects', context.companyId);
        const project = preparation.project;
        const projectExtraData = {
          quoteId: this.text(project.quoteId),
          technicalSurveyId: this.text(project.technicalSurveyId),
          preProject: project.preProject === true,
          code: this.text(project.code),
          cost: this.number(project.cost),
          due: this.text(project.due, 'A definir'),
          description: this.text(project.description),
          scope: this.record(project.scope) || {},
        };
        if (preparation.created) {
          await client.query(
            `insert into projects_domain_entries
              (company_id, id, name, client_id, technical_stage, status, manager, progress, budget, extra_data, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())`,
            [context.companyId, this.text(project.id), this.text(project.name, 'Projeto técnico'), this.text(project.clientId), this.text(project.technicalStage, 'Projeto técnico'), this.text(project.status, 'Pré-projeto'), this.text(project.manager, 'A definir'), this.number(project.progress), this.number(project.budget), JSON.stringify(projectExtraData)],
          );
        } else {
          await client.query(
            `update projects_domain_entries
             set name = $1, client_id = $2, technical_stage = $3, status = $4, manager = $5,
                 progress = $6, budget = $7, extra_data = $8::jsonb, updated_at = now()
             where company_id = $9 and id = $10`,
            [this.text(project.name, 'Projeto técnico'), this.text(project.clientId), this.text(project.technicalStage, 'Projeto técnico'), this.text(project.status, 'Pré-projeto'), this.text(project.manager, 'A definir'), this.number(project.progress), this.number(project.budget), JSON.stringify(projectExtraData), context.companyId, this.text(project.id)],
          );
        }
        nextProjectsRevision = await this.bumpDomainRevision(client, 'projects_domain_state', context.companyId);
      }
      await client.query(
        `update survey_domain_surveys set status = 'Enviado ao orçamento', updated_at = now()
         where company_id = $1 and id = $2`,
        [context.companyId, surveyId],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      const nextOpportunityRevision = opportunityChanged ? await this.bumpDomainRevision(client, 'opportunities_domain_state', context.companyId) : opportunityRevision;
      const nextQuotesRevision = await this.bumpDomainRevision(client, 'quotes_domain_state', context.companyId);
      await client.query('commit');
      return {
        status: 200,
        body: JSON.stringify({ ok: true, quoteId: this.text(quote.id), roomsCreated: missing.length, itemsGenerated: mapping.added + mapping.updated, unmappedItems: mapping.unmapped.length, value: mapping.value, preProjectId: preparation.project?.id, preProjectCreated: preparation.created, revision: nextRevision, opportunityRevision: nextOpportunityRevision, quotesRevision: nextQuotesRevision, projectsRevision: nextProjectsRevision }),
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveSurvey(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySaveSurvey(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de levantamento invalido.');
    const input = body as { survey?: unknown; baseRevision?: unknown };
    const survey = this.record(input.survey);
    if (!survey || !this.text(survey.title).trim()) throw new BadRequestException('O levantamento precisa conter titulo.');
    const surveyId = this.text(survey.id) || `lev-${crypto.randomUUID()}`;
    if (expectedId && surveyId !== expectedId) throw new BadRequestException('O identificador do levantamento nao confere.');
    const normalized = {
      id: expectedId || surveyId,
      opportunityId: this.text(survey.opportunityId),
      title: this.text(survey.title),
      site: this.text(survey.site),
      source: this.text(survey.source, 'Preenchimento manual'),
      status: this.text(survey.status, 'Em levantamento'),
      notes: this.text(survey.notes),
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
        'select id, extra_data as "extraData" from survey_domain_surveys where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Levantamento nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um levantamento com este identificador.');
      await client.query(
        `insert into survey_domain_surveys (company_id, id, opportunity_id, title, site, source, status, notes, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
         on conflict (company_id, id) do update set opportunity_id = excluded.opportunity_id, title = excluded.title,
           site = excluded.site, source = excluded.source, status = excluded.status, notes = excluded.notes,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.opportunityId, normalized.title, normalized.site, normalized.source,
          normalized.status, normalized.notes, JSON.stringify({ ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(survey) })],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, survey: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async savePoint(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySavePoint(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ponto tecnico invalido.');
    const input = body as { point?: unknown; baseRevision?: unknown };
    const point = this.record(input.point);
    const surveyId = this.text(point?.surveyId);
    if (!point || !surveyId || !this.text(point.type).trim()) throw new BadRequestException('O ponto precisa conter levantamento e tipo.');
    const pointId = this.text(point.id) || `ptl-${crypto.randomUUID()}`;
    if (expectedId && pointId !== expectedId) throw new BadRequestException('O identificador do ponto nao confere.');
    const normalized = {
      id: expectedId || pointId,
      surveyId,
      room: this.text(point.room, 'Ambiente nao informado'),
      roomId: this.text(point.roomId),
      type: this.text(point.type),
      technology: this.text(point.technology),
      quantity: this.number(point.quantity, 1),
      status: this.text(point.status, 'Em levantamento'),
      notes: this.text(point.notes),
    };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const survey = await client.query('select id from survey_domain_surveys where company_id = $1 and id = $2', [context.companyId, surveyId]);
      if (!survey.rowCount) throw new NotFoundException('Levantamento nao encontrado.');
      const existing = await client.query(
        'select id, extra_data as "extraData" from survey_domain_points where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Ponto tecnico nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um ponto com este identificador.');
      await client.query(
        `insert into survey_domain_points (company_id, id, survey_id, room, room_id, type, technology, quantity, status, notes, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
         on conflict (company_id, id) do update set survey_id = excluded.survey_id, room = excluded.room, room_id = excluded.room_id,
           type = excluded.type, technology = excluded.technology, quantity = excluded.quantity, status = excluded.status,
           notes = excluded.notes, extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.surveyId, normalized.room, normalized.roomId, normalized.type, normalized.technology,
          normalized.quantity, normalized.status, normalized.notes, JSON.stringify({ ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraData(point) })],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, point: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async removePoint(id: string, cookie?: string, body?: unknown): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacyRemovePoint(id, cookie);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!id.trim()) throw new BadRequestException('O identificador do ponto e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      const baseRevision = input.baseRevision == null ? currentRevision : this.revision(input.baseRevision);
      if (currentRevision !== baseRevision) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const deleted = await client.query('delete from survey_domain_points where company_id = $1 and id = $2 returning id', [context.companyId, id]);
      if (!deleted.rowCount) throw new NotFoundException('Ponto tecnico nao encontrado.');
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

  private async directSnapshot(companyId: string): Promise<{ surveys: Survey[]; points: SurveyPoint[]; rooms: SurveyRoom[]; revision: number }> {
    const [surveys, points, rooms, state] = await Promise.all([
      this.pool!.query(`select id, opportunity_id as "opportunityId", title, site, source, status, notes, extra_data as "extraData" from survey_domain_surveys where company_id = $1 order by updated_at desc, title asc`, [companyId]),
      this.pool!.query(`select id, survey_id as "surveyId", room, room_id as "roomId", type, technology, quantity, status, notes, extra_data as "extraData" from survey_domain_points where company_id = $1 order by updated_at desc, type asc`, [companyId]),
      this.pool!.query(`select id, survey_id as "surveyId", name, extra_data as "extraData" from survey_domain_rooms where company_id = $1 order by updated_at desc, name asc`, [companyId]),
      this.pool!.query('select revision from survey_domain_state where company_id = $1', [companyId]),
    ]);
    return {
      surveys: surveys.rows.map((row) => this.surveyFromRow(row)),
      points: points.rows.map((row) => this.pointFromRow(row)),
      rooms: rooms.rows.map((row) => this.roomFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  private async markSent(companyId: string, surveyId: string, baseRevision: number): Promise<{ status: number; revision?: number; body: string }> {
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, companyId);
      if (currentRevision !== baseRevision) {
        await client.query('rollback');
        return { ...this.conflict(currentRevision), revision: currentRevision };
      }
      const result = await client.query(
        `update survey_domain_surveys set status = 'Enviado ao orçamento', updated_at = now()
         where company_id = $1 and id = $2 returning id`,
        [companyId, surveyId],
      );
      if (!result.rowCount) throw new NotFoundException('Levantamento nao encontrado.');
      const revision = await this.bumpRevision(client, companyId);
      await client.query('commit');
      return { status: 200, revision, body: JSON.stringify({ ok: true, revision }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('survey') && !modules.includes('survey')) throw new ForbiddenException('Seu perfil nao possui acesso ao levantamento tecnico.');
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: this.text(user.role, 'leitura'), permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'comercial') throw new ForbiddenException('Seu perfil nao pode alterar o levantamento tecnico.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:survey:${companyId}`]);
    const result = await client.query('select revision from survey_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into survey_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update survey_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
    return Number(result.rows[0].revision);
  }

  private async lockDomainRevision(client: PoolClient, tableName: string, lockKey: string, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${lockKey}:${companyId}`]);
    const result = await client.query(`select revision from ${tableName} where company_id = $1 for update`, [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query(`insert into ${tableName} (company_id, revision) values ($1, 0)`, [companyId]);
    return 0;
  }

  private async bumpDomainRevision(client: PoolClient, tableName: string, companyId: string): Promise<number> {
    const result = await client.query(`update ${tableName} set revision = revision + 1, updated_at = now() where company_id = $1 returning revision`, [companyId]);
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private surveyFromRow(row: RecordItem): Survey {
    return { ...(this.record(row.extraData) || {}), id: this.text(row.id), opportunityId: this.text(row.opportunityId), title: this.text(row.title, 'Levantamento sem titulo'), site: this.text(row.site), source: this.text(row.source, 'Preenchimento manual'), status: this.text(row.status, 'Em andamento'), notes: this.text(row.notes) };
  }

  private pointFromRow(row: RecordItem): SurveyPoint {
    return { ...(this.record(row.extraData) || {}), id: this.text(row.id), surveyId: this.text(row.surveyId), room: this.text(row.room, 'Ambiente nao informado'), roomId: this.text(row.roomId), name: this.text(row.name ?? row.type, 'Ponto sem nome'), type: this.text(row.type, 'Ponto tecnico'), technology: this.text(row.technology), quantity: this.number(row.quantity), status: this.text(row.status, 'Em levantamento'), notes: this.text(row.notes) };
  }

  private roomFromRow(row: RecordItem): SurveyRoom {
    return { ...(this.record(row.extraData) || {}), id: this.text(row.id), surveyId: this.text(row.surveyId), name: this.text(row.name, 'Ambiente sem nome') };
  }

  private extraData(value: RecordItem): RecordItem {
    const { id, opportunityId, surveyId, room, roomId, name, title, site, source, status, notes, type, technology, quantity, updatedAt, createdAt, ...extra } = value;
    void id; void opportunityId; void surveyId; void room; void roomId; void name; void title; void site; void source; void status; void notes; void type; void technology; void quantity; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ surveys: Survey[]; points: SurveyPoint[]; rooms: SurveyRoom[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => { throw new ServiceUnavailableException('Backend legado indisponivel para leitura do levantamento.'); });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar o levantamento tecnico.');
    const payload = await upstream.json() as AggregateResponse;
    return { surveys: this.normalizeSurveys(payload.data?.surveys), points: this.normalizePoints(payload.data?.surveyPoints), rooms: this.normalizeRooms(payload.data?.surveyRooms), revision: payload.revision };
  }

  private async legacySaveRooms(surveyId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!surveyId.trim()) throw new BadRequestException('O identificador do levantamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ambientes invalido.');
    const input = body as { rooms?: unknown; baseRevision?: unknown };
    if (!Array.isArray(input.rooms)) throw new BadRequestException('A gravacao precisa conter rooms como lista.');
    const current = await this.readAggregate(cookie);
    const surveys = Array.isArray(current.data.surveys) ? current.data.surveys : [];
    if (!surveys.some((item) => this.sameId(item, surveyId))) throw new NotFoundException('Levantamento nao encontrado.');
    const rooms = input.rooms.map((item, index) => { const room = this.record(item); if (!room || this.text(room.surveyId, surveyId) !== surveyId) throw new BadRequestException('Todos os ambientes precisam pertencer ao levantamento informado.'); const name = this.text(room.name); if (!name) throw new BadRequestException('Todo ambiente precisa conter nome.'); return { ...room, id: this.text(room.id, `room-${crypto.randomUUID()}-${index}`), surveyId, name }; });
    if (new Set(rooms.map((room) => room.name.toLocaleLowerCase())).size !== rooms.length) throw new BadRequestException('Nao e permitido repetir ambiente no levantamento.');
    const currentRooms = this.normalizeRooms(current.data.surveyRooms).filter((room) => room.surveyId === surveyId);
    const points = Array.isArray(current.data.surveyPoints) ? current.data.surveyPoints.map((item) => { const point = this.record(item); if (!point || this.text(point.surveyId) !== surveyId) return item; const previous = currentRooms.find((room) => room.id === this.text(point.roomId) || room.name === this.text(point.room)); const next = previous ? rooms.find((room) => room.id === previous.id) : undefined; return previous && next && previous.name !== next.name ? { ...point, room: next.name, roomId: next.id } : item; }) : [];
    const otherRooms = (Array.isArray(current.data.surveyRooms) ? current.data.surveyRooms : []).filter((item) => !this.sameSurvey(item, surveyId));
    return this.forward({ ...current.data, surveyRooms: [...otherRooms, ...rooms], surveyPoints: points }, input.baseRevision, cookie);
  }

  private async legacySendToQuote(surveyId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!surveyId.trim()) throw new BadRequestException('O identificador do levantamento e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    const current = await this.readAggregate(cookie);
    const surveys = Array.isArray(current.data.surveys) ? current.data.surveys : [];
    const survey = surveys.find((item) => this.sameId(item, surveyId)) as RecordItem | undefined;
    if (!survey) throw new NotFoundException('Levantamento nao encontrado.');
    const opportunities = Array.isArray(current.data.opportunities) ? current.data.opportunities : [];
    const opportunity = opportunities.find((item) => this.sameId(item, this.text(survey.opportunityId))) as RecordItem | undefined;
    if (!opportunity) throw new BadRequestException('Vincule este levantamento a uma oportunidade antes de criar o orcamento.');
    const points = (Array.isArray(current.data.surveyPoints) ? current.data.surveyPoints : []).filter((item) => this.text(this.record(item)?.surveyId) === surveyId);
    if (!['Validado', 'Enviado ao orçamento'].includes(this.text(survey.status)) || !points.some((item) => this.number(this.record(item)?.quantity) > 0)) throw new BadRequestException('Valide o levantamento e registre ao menos um ponto ou quantitativo antes de envia-lo ao orcamento.');
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    let quote = quotes.find((item) => { const record = this.record(item); return record !== null && this.text(record.opportunityId) === this.text(opportunity.id) && this.text(record.status) !== 'Aprovado'; }) as RecordItem | undefined;
    if (!quote) { quote = { id: `orc-${crypto.randomUUID()}`, opportunityId: this.text(opportunity.id), technicalSurveyId: surveyId, clientId: '', title: `Proposta — ${this.text(opportunity.company, 'Cliente')}`, value: 0, status: 'Em elaboração' }; quotes.unshift(quote); opportunity.stage = 'Orçamento'; } else if (!this.text(quote.technicalSurveyId)) quote.technicalSurveyId = surveyId;
    const roomNames = [...new Set([...this.normalizeRooms(current.data.surveyRooms).filter((room) => room.surveyId === surveyId).map((room) => room.name), ...points.map((item) => this.text(this.record(item)?.room))].filter(Boolean))];
    const quoteRooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const existingNames = quoteRooms.filter((item) => this.text(this.record(item)?.quoteId) === this.text(quote.id)).map((item) => this.text(this.record(item)?.name));
    const surveyRooms = this.normalizeRooms(current.data.surveyRooms).filter((room) => room.surveyId === surveyId);
    const missing = roomNames.filter((name) => !existingNames.includes(name));
    missing.forEach((name) => { const source = surveyRooms.find((room) => room.name === name); quoteRooms.push({ id: `amb-${crypto.randomUUID()}`, quoteId: this.text(quote?.id), technicalSurveyId: surveyId, surveyRoomId: source?.id || '', name, items: [] }); });
    survey.status = 'Enviado ao orçamento';
    const nextData = { ...current.data, surveys, opportunities, quotes, quoteRooms, surveyPoints: points };
    const mapping = surveyQuoteMapper.populateQuoteFromSurvey(nextData, surveyId, this.text(quote.id), prefix => `${prefix}-${crypto.randomUUID()}`);
    const preparation = surveyQuoteMapper.ensurePreProjectFromQuote(nextData, surveyId, this.text(quote.id), prefix => `${prefix}-${crypto.randomUUID()}`);
    const upstream = await this.forward(nextData, input.baseRevision ?? current.revision, cookie);
    if (upstream.status < 200 || upstream.status >= 300) return upstream;
    try { const result = JSON.parse(upstream.body) as RecordItem; return { status: upstream.status, body: JSON.stringify({ ...result, quoteId: this.text(quote.id), roomsCreated: missing.length, itemsGenerated: mapping.added + mapping.updated, unmappedItems: mapping.unmapped.length, value: mapping.value, preProjectId: preparation.project?.id, preProjectCreated: preparation.created }) }; } catch { return { status: upstream.status, body: JSON.stringify({ ok: true, quoteId: this.text(quote.id), roomsCreated: missing.length, itemsGenerated: mapping.added + mapping.updated, unmappedItems: mapping.unmapped.length, value: mapping.value, preProjectId: preparation.project?.id, preProjectCreated: preparation.created }) }; }
  }

  private async legacySaveSurvey(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de levantamento invalido.');
    const input = body as { survey?: unknown; baseRevision?: unknown };
    const survey = this.record(input.survey);
    if (!survey || !this.text(survey.title).trim()) throw new BadRequestException('O levantamento precisa conter titulo.');
    const surveyId = this.text(survey.id) || `lev-${crypto.randomUUID()}`;
    if (expectedId && surveyId !== expectedId) throw new BadRequestException('O identificador do levantamento nao confere.');
    const current = await this.readAggregate(cookie);
    const surveys = Array.isArray(current.data.surveys) ? current.data.surveys : [];
    const index = surveys.findIndex((item) => this.sameId(item, expectedId || surveyId));
    if (expectedId && index < 0) throw new NotFoundException('Levantamento nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um levantamento com este identificador.');
    const normalized = { ...survey, id: expectedId || surveyId, opportunityId: this.text(survey.opportunityId), title: this.text(survey.title), site: this.text(survey.site), source: this.text(survey.source, 'Preenchimento manual'), status: this.text(survey.status, 'Em levantamento'), notes: this.text(survey.notes), updatedAt: new Date().toISOString() };
    const nextSurveys = expectedId ? surveys.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item) : [...surveys, normalized];
    return this.forward({ ...current.data, surveys: nextSurveys }, input.baseRevision, cookie);
  }

  private async legacySavePoint(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ponto tecnico invalido.');
    const input = body as { point?: unknown; baseRevision?: unknown };
    const point = this.record(input.point);
    const surveyId = this.text(point?.surveyId);
    if (!point || !surveyId || !this.text(point.type).trim()) throw new BadRequestException('O ponto precisa conter levantamento e tipo.');
    const pointId = this.text(point.id) || `ptl-${crypto.randomUUID()}`;
    if (expectedId && pointId !== expectedId) throw new BadRequestException('O identificador do ponto nao confere.');
    const current = await this.readAggregate(cookie);
    const surveys = Array.isArray(current.data.surveys) ? current.data.surveys : [];
    if (!surveys.some((item) => this.sameId(item, surveyId))) throw new NotFoundException('Levantamento nao encontrado.');
    const points = Array.isArray(current.data.surveyPoints) ? current.data.surveyPoints : [];
    const index = points.findIndex((item) => this.sameId(item, expectedId || pointId));
    if (expectedId && index < 0) throw new NotFoundException('Ponto tecnico nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um ponto com este identificador.');
    const normalized = { ...point, id: expectedId || pointId, surveyId, room: this.text(point.room, 'Ambiente nao informado'), type: this.text(point.type), technology: this.text(point.technology), quantity: this.number(point.quantity, 1), status: this.text(point.status, 'Em levantamento'), notes: this.text(point.notes) };
    const nextPoints = expectedId ? points.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item) : [...points, normalized];
    return this.forward({ ...current.data, surveyPoints: nextPoints }, input.baseRevision, cookie);
  }

  private async legacyRemovePoint(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador do ponto e obrigatorio.');
    const current = await this.readAggregate(cookie);
    const points = Array.isArray(current.data.surveyPoints) ? current.data.surveyPoints : [];
    if (!points.some((item) => this.sameId(item, id))) throw new NotFoundException('Ponto tecnico nao encontrado.');
    return this.forward({ ...current.data, surveyPoints: points.filter((item) => !this.sameId(item, id)) }, current.revision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<AggregateResponse & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => { throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do levantamento.'); });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao do levantamento.');
    try { const payload = JSON.parse(body) as AggregateResponse; return { ...payload, data: payload.data && typeof payload.data === 'object' ? payload.data : {} }; } catch { throw new ServiceUnavailableException('Resposta invalida do backend legado.'); }
  }

  private async forward(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ data, baseRevision }) }).catch(() => { throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do levantamento.'); });
    return { status: upstream.status, body: await upstream.text() };
  }

  private record(value: unknown): RecordItem | null { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null; }
  private sameId(value: unknown, expectedId: string): boolean { const item = this.record(value); return item !== null && this.text(item.id) === expectedId; }
  private sameSurvey(value: unknown, surveyId: string): boolean { const item = this.record(value); return item !== null && this.text(item.surveyId ?? item.technicalSurveyId) === surveyId; }
  private normalizeSurveys(value: unknown): Survey[] { if (!Array.isArray(value)) return []; return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({ ...item, id: this.text(item.id, `legacy-survey-${index + 1}`), opportunityId: this.text(item.opportunityId), title: this.text(item.title ?? item.name, 'Levantamento sem titulo'), status: this.text(item.status, 'Em andamento') })); }
  private normalizePoints(value: unknown): SurveyPoint[] { if (!Array.isArray(value)) return []; return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({ ...item, id: this.text(item.id, `legacy-survey-point-${index + 1}`), surveyId: this.text(item.surveyId), name: this.text(item.name ?? item.title ?? item.type, 'Ponto sem nome'), type: this.text(item.type, 'Ponto tecnico') })); }
  private normalizeRooms(value: unknown): SurveyRoom[] { if (!Array.isArray(value)) return []; return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({ ...item, id: this.text(item.id, `legacy-survey-room-${index + 1}`), surveyId: this.text(item.surveyId ?? item.technicalSurveyId), name: this.text(item.name ?? item.room, `Ambiente ${index + 1}`) })); }
  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown, fallback = 0): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : fallback; }
}
