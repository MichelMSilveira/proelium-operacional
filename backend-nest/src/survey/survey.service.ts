import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Survey = { id: string; opportunityId: string; title: string; status: string; [key: string]: unknown };
export type SurveyPoint = { id: string; surveyId: string; name: string; type: string; [key: string]: unknown };

@Injectable()
export class SurveyService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ surveys: Survey[]; points: SurveyPoint[] }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura do levantamento.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar o levantamento tecnico.');
    const payload = await upstream.json() as { data?: { surveys?: unknown; surveyPoints?: unknown } };
    return {
      surveys: this.normalizeSurveys(payload.data?.surveys),
      points: this.normalizePoints(payload.data?.surveyPoints),
    };
  }

  private normalizeSurveys(value: unknown): Survey[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-survey-${index + 1}`),
      opportunityId: this.text(item.opportunityId),
      title: this.text(item.title ?? item.name, 'Levantamento sem titulo'),
      status: this.text(item.status, 'Em andamento'),
    }));
  }

  private normalizePoints(value: unknown): SurveyPoint[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-survey-point-${index + 1}`),
      surveyId: this.text(item.surveyId),
      name: this.text(item.name ?? item.title, 'Ponto sem nome'),
      type: this.text(item.type, 'Ponto tecnico'),
    }));
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
