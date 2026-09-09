import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type Equipment = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  status: string;
  [key: string]: unknown;
};

@Injectable()
export class EquipmentService {
  private readonly legacyOrigin = process.env.LEGACY_API_ORIGIN || 'http://localhost:4173';

  async list(cookie?: string): Promise<{ equipment: Equipment[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura dos equipamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os equipamentos.');
    const payload = await upstream.json() as { revision?: number; data?: { equipment?: unknown } };
    return { equipment: this.normalizeList(payload.data?.equipment), revision: payload.revision };
  }

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de equipamento invalido.');
    const input = body as { equipment?: unknown; baseRevision?: unknown };
    const equipment = this.record(input.equipment);
    if (!equipment) throw new BadRequestException('A gravacao precisa conter um equipamento valido.');
    const equipmentId = this.text(equipment.id);
    if (!equipmentId) throw new BadRequestException('O equipamento precisa conter identificador.');
    if (expectedId && equipmentId !== expectedId) throw new BadRequestException('O identificador do equipamento nao confere.');
    const currentResponse = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao dos equipamentos.');
    });
    const currentBody = await currentResponse.text();
    if (!currentResponse.ok) return { status: currentResponse.status, body: currentBody };
    let currentPayload: { data?: Record<string, unknown> };
    try { currentPayload = JSON.parse(currentBody) as { data?: Record<string, unknown> }; }
    catch { throw new ServiceUnavailableException('Resposta invalida do backend legado.'); }
    const currentData = currentPayload.data && typeof currentPayload.data === 'object' ? currentPayload.data : {};
    const currentEquipment = Array.isArray(currentData.equipment) ? currentData.equipment : [];
    const index = currentEquipment.findIndex((item) => this.sameId(item, expectedId || equipmentId));
    if (expectedId && index < 0) throw new NotFoundException('Equipamento nao encontrado.');
    if (!expectedId && index >= 0) throw new BadRequestException('Ja existe um equipamento com este identificador.');
    const nextEquipment = expectedId
      ? currentEquipment.map((item, itemIndex) => itemIndex === index ? { ...this.record(item), ...equipment, id: expectedId } : item)
      : [...currentEquipment, equipment];
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data: { ...currentData, equipment: nextEquipment }, baseRevision: input.baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao dos equipamentos.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  private normalizeList(value: unknown): Equipment[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-equipment-${index + 1}`),
      name: this.text(item.name ?? item.nome ?? item.model, `Equipamento ${index + 1}`),
      manufacturer: this.text(item.manufacturer ?? item.brand ?? item.fabricante),
      model: this.text(item.model ?? item.modelo),
      serialNumber: this.text(item.serialNumber ?? item.serial ?? item.numeroSerie),
      location: this.text(item.location ?? item.localizacao ?? item.local),
      status: this.text(item.status, 'Sem status informado'),
    }));
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value);
  }
}
