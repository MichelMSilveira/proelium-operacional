import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type Appointment = { id: string; title: string; date: string; time: string; person: string; projectId: string; status: string; [key: string]: unknown };

@Injectable()
export class AgendaService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<Appointment[]> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura da agenda.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar a agenda.');
    const payload = await upstream.json() as { data?: { appointments?: unknown } };
    return this.normalizeList(payload.data?.appointments);
  }

  private normalizeList(value: unknown): Appointment[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-appointment-${index + 1}`), title: this.text(item.title, 'Compromisso sem título'),
      date: this.text(item.date), time: this.text(item.time), person: this.text(item.person), projectId: this.text(item.projectId),
      status: this.text(item.status, 'Agendado'),
    }));
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
