import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type RecordItem = Record<string, unknown>;
type AggregateResponse = { data?: Record<string, unknown>; revision?: number };

export type Survey = { id: string; opportunityId: string; title: string; status: string; [key: string]: unknown };
export type SurveyPoint = { id: string; surveyId: string; name: string; type: string; [key: string]: unknown };

@Injectable()
export class SurveyService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ surveys: Survey[]; points: SurveyPoint[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do levantamento.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar o levantamento tecnico.');
    const payload = await upstream.json() as AggregateResponse;
    return {
      surveys: this.normalizeSurveys(payload.data?.surveys),
      points: this.normalizePoints(payload.data?.surveyPoints),
      revision: payload.revision,
    };
  }

  async saveSurvey(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
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
    const normalized = {
      ...survey,
      id: expectedId || surveyId,
      opportunityId: this.text(survey.opportunityId),
      title: this.text(survey.title),
      site: this.text(survey.site),
      source: this.text(survey.source, 'Preenchimento manual'),
      status: this.text(survey.status, 'Em levantamento'),
      notes: this.text(survey.notes),
      updatedAt: new Date().toISOString(),
    };
    const nextSurveys = expectedId
      ? surveys.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [...surveys, normalized];
    return this.forward({ ...current.data, surveys: nextSurveys }, input.baseRevision, cookie);
  }

  async savePoint(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
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
    const normalized = {
      ...point,
      id: expectedId || pointId,
      surveyId,
      room: this.text(point.room, 'Ambiente nao informado'),
      type: this.text(point.type),
      technology: this.text(point.technology),
      quantity: this.number(point.quantity, 1),
      status: this.text(point.status, 'Em levantamento'),
      notes: this.text(point.notes),
    };
    const nextPoints = expectedId
      ? points.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...normalized, id: expectedId } : item)
      : [...points, normalized];
    return this.forward({ ...current.data, surveyPoints: nextPoints }, input.baseRevision, cookie);
  }

  async removePoint(id: string, cookie?: string): Promise<{ status: number; body: string }> {
    if (!id.trim()) throw new BadRequestException('O identificador do ponto e obrigatorio.');
    const current = await this.readAggregate(cookie);
    const points = Array.isArray(current.data.surveyPoints) ? current.data.surveyPoints : [];
    if (!points.some((item) => this.sameId(item, id))) throw new NotFoundException('Ponto tecnico nao encontrado.');
    return this.forward({ ...current.data, surveyPoints: points.filter((item) => !this.sameId(item, id)) }, current.revision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<AggregateResponse & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do levantamento.');
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao do levantamento.');
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
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do levantamento.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private record(value: unknown): RecordItem | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && this.text(item.id) === expectedId;
  }

  private normalizeSurveys(value: unknown): Survey[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-survey-${index + 1}`),
      opportunityId: this.text(item.opportunityId),
      title: this.text(item.title ?? item.name, 'Levantamento sem titulo'),
      status: this.text(item.status, 'Em andamento'),
    }));
  }

  private normalizePoints(value: unknown): SurveyPoint[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-survey-point-${index + 1}`),
      surveyId: this.text(item.surveyId),
      name: this.text(item.name ?? item.title ?? item.type, 'Ponto sem nome'),
      type: this.text(item.type, 'Ponto tecnico'),
    }));
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }

  private number(value: unknown, fallback = 0): number {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : fallback;
  }
}
