import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

type RecordItem = Record<string, unknown>;
type Aggregate = { revision?: number; data?: Record<string, unknown> };
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

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

export type EquipmentHistory = {
  id: string;
  equipmentId: string;
  clientId: string;
  projectId: string;
  date: string;
  type: string;
  note: string;
  [key: string]: unknown;
};

@Injectable()
export class EquipmentService {
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

  async list(cookie?: string): Promise<{ equipment: Equipment[]; equipmentHistory: EquipmentHistory[]; revision?: number }> {
    if (!this.pool) return this.legacyList(cookie);
    const context = await this.authContext(cookie);
    const [equipment, history, state] = await Promise.all([
      this.pool.query(
        `select id, name, manufacturer, model, serial_number as "serialNumber", location, status, extra_data as "extraData"
         from equipment_domain_entries where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool.query(
        `select id, equipment_id as "equipmentId", client_id as "clientId", project_id as "projectId",
                history_date as date, type, note, extra_data as "extraData"
         from equipment_domain_history where company_id = $1 order by history_date desc, updated_at desc` ,
        [context.companyId],
      ),
      this.pool.query('select revision from equipment_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      equipment: equipment.rows.map((row) => this.equipmentFromRow(row)),
      equipmentHistory: history.rows.map((row) => this.historyFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  async history(equipmentId: string, cookie?: string): Promise<{ equipmentHistory: EquipmentHistory[]; revision?: number }> {
    if (!equipmentId.trim()) throw new BadRequestException('O identificador do equipamento e obrigatorio.');
    if (!this.pool) {
      const current = await this.readAggregate(cookie);
      const equipment = Array.isArray(current.data.equipment) ? current.data.equipment : [];
      if (!equipment.some((item) => this.sameId(item, equipmentId))) throw new NotFoundException('Equipamento nao encontrado.');
      return {
        equipmentHistory: this.normalizeHistoryList(current.data.equipmentHistory).filter((item) => item.equipmentId === equipmentId),
        revision: current.revision,
      };
    }
    const context = await this.authContext(cookie);
    const [equipment, history, state] = await Promise.all([
      this.pool.query('select id from equipment_domain_entries where company_id = $1 and id = $2', [context.companyId, equipmentId]),
      this.pool.query(
        `select id, equipment_id as "equipmentId", client_id as "clientId", project_id as "projectId",
                history_date as date, type, note, extra_data as "extraData"
         from equipment_domain_history where company_id = $1 and equipment_id = $2
         order by history_date desc, updated_at desc`,
        [context.companyId, equipmentId],
      ),
      this.pool.query('select revision from equipment_domain_state where company_id = $1', [context.companyId]),
    ]);
    if (!equipment.rowCount) throw new NotFoundException('Equipamento nao encontrado.');
    return { equipmentHistory: history.rows.map((row) => this.historyFromRow(row)), revision: Number(state.rows[0]?.revision || 0) };
  }

  async saveHistory(body: unknown, equipmentId: string, cookie?: string, expectedHistoryId?: string): Promise<{ status: number; body: string }> {
    if (!equipmentId.trim()) throw new BadRequestException('O identificador do equipamento e obrigatorio.');
    if (!this.pool) return this.legacySaveHistory(body, equipmentId, cookie, expectedHistoryId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de historico invalido.');
    const input = body as { history?: unknown; equipmentHistory?: unknown; baseRevision?: unknown };
    const history = this.record(input.history ?? input.equipmentHistory);
    if (!history) throw new BadRequestException('A gravacao precisa conter um historico valido.');
    const historyId = this.text(history.id) || `hist-${crypto.randomUUID()}`;
    if (expectedHistoryId && historyId !== expectedHistoryId) throw new BadRequestException('O identificador do historico nao confere.');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const owner = await client.query('select id from equipment_domain_entries where company_id = $1 and id = $2', [context.companyId, equipmentId]);
      if (!owner.rowCount) throw new NotFoundException('Equipamento nao encontrado.');
      const existing = await client.query(
        'select equipment_id as "equipmentId", extra_data as "extraData" from equipment_domain_history where company_id = $1 and id = $2',
        [context.companyId, expectedHistoryId || historyId],
      );
      if (expectedHistoryId && (!existing.rowCount || this.text(existing.rows[0].equipmentId) !== equipmentId)) throw new NotFoundException('Historico nao encontrado.');
      if (!expectedHistoryId && existing.rowCount) throw new BadRequestException('Ja existe um historico com este identificador.');
      const normalized = this.normalizeHistory(history, expectedHistoryId || historyId, equipmentId);
      const extraData = { ...(this.record(existing.rows[0]?.extraData) || {}), ...this.extraHistory(history) };
      await client.query(
        `insert into equipment_domain_history
          (company_id, id, equipment_id, client_id, project_id, history_date, type, note, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
         on conflict (company_id, id) do update set
           equipment_id = excluded.equipment_id, client_id = excluded.client_id, project_id = excluded.project_id,
           history_date = excluded.history_date, type = excluded.type, note = excluded.note,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.equipmentId, normalized.clientId, normalized.projectId,
          normalized.date, normalized.type, normalized.note, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedHistoryId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, history: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeHistory(equipmentId: string, historyId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!equipmentId.trim() || !historyId.trim()) throw new BadRequestException('Os identificadores do equipamento e do historico sao obrigatorios.');
    if (!this.pool) return this.legacyRemoveHistory(equipmentId, historyId, body, cookie);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const deleted = await client.query(
        'delete from equipment_domain_history where company_id = $1 and equipment_id = $2 and id = $3 returning id',
        [context.companyId, equipmentId, historyId],
      );
      if (!deleted.rowCount) throw new NotFoundException('Historico nao encontrado.');
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

  async save(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
    if (!this.pool) return this.legacySave(body, cookie, expectedId);
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de equipamento invalido.');
    const input = body as { equipment?: unknown; baseRevision?: unknown };
    const equipment = this.record(input.equipment);
    if (!equipment) throw new BadRequestException('A gravacao precisa conter um equipamento valido.');
    const equipmentId = this.text(equipment.id);
    if (!equipmentId) throw new BadRequestException('O equipamento precisa conter identificador.');
    if (expectedId && equipmentId !== expectedId) throw new BadRequestException('O identificador do equipamento nao confere.');
    const normalized = this.normalizeEquipment(equipment, expectedId || equipmentId);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query(
        'select id, extra_data as "extraData" from equipment_domain_entries where company_id = $1 and id = $2',
        [context.companyId, normalized.id],
      );
      if (expectedId && !existing.rowCount) throw new NotFoundException('Equipamento nao encontrado.');
      if (!expectedId && existing.rowCount) throw new BadRequestException('Ja existe um equipamento com este identificador.');
      const extraData = {
        ...(this.record(existing.rows[0]?.extraData) || {}),
        ...this.extraData(equipment),
      };
      await client.query(
        `insert into equipment_domain_entries
          (company_id, id, name, manufacturer, model, serial_number, location, status, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
         on conflict (company_id, id) do update set
           name = excluded.name, manufacturer = excluded.manufacturer, model = excluded.model,
           serial_number = excluded.serial_number, location = excluded.location, status = excluded.status,
           extra_data = excluded.extra_data, updated_at = now()`,
        [context.companyId, normalized.id, normalized.name, normalized.manufacturer, normalized.model,
          normalized.serialNumber, normalized.location, normalized.status, JSON.stringify(extraData)],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: expectedId ? 200 : 201, body: JSON.stringify({ ok: true, revision: nextRevision, equipment: normalized }) };
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
    if (this.text(user.role) !== 'admin' && !permissions.includes('equipment') && !modules.includes('equipment')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos equipamentos.');
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
      throw new ForbiddenException('Seu perfil nao pode alterar equipamentos.');
    }
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:equipment:${companyId}`]);
    const result = await client.query('select revision from equipment_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into equipment_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query(
      'update equipment_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision',
      [companyId],
    );
    return Number(result.rows[0].revision);
  }

  private conflict(revision: number): { status: number; body: string } {
    return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) };
  }

  private equipmentFromRow(row: RecordItem): Equipment {
    return this.normalizeEquipment({ ...(this.record(row.extraData) || {}), id: row.id, name: row.name, manufacturer: row.manufacturer, model: row.model, serialNumber: row.serialNumber, location: row.location, status: row.status }, this.text(row.id));
  }

  private historyFromRow(row: RecordItem): EquipmentHistory {
    return this.normalizeHistory({ ...(this.record(row.extraData) || {}), id: row.id, equipmentId: row.equipmentId, clientId: row.clientId, projectId: row.projectId, date: row.date, type: row.type, note: row.note }, this.text(row.id), this.text(row.equipmentId));
  }

  private normalizeEquipment(item: RecordItem, id: string): Equipment {
    return {
      ...item,
      id,
      name: this.text(item.name ?? item.nome ?? item.model, 'Equipamento sem nome'),
      manufacturer: this.text(item.manufacturer ?? item.brand ?? item.fabricante),
      model: this.text(item.model ?? item.modelo),
      serialNumber: this.text(item.serialNumber ?? item.serial ?? item.numeroSerie),
      location: this.text(item.location ?? item.localizacao ?? item.local),
      status: this.text(item.status, 'Sem status informado'),
    };
  }

  private extraData(equipment: RecordItem): RecordItem {
    const { id, name, nome, manufacturer, brand, fabricante, model, modelo, serialNumber, serial, numeroSerie, location, localizacao, local, status, updatedAt, createdAt, ...extra } = equipment;
    void id; void name; void nome; void manufacturer; void brand; void fabricante; void model; void modelo; void serialNumber; void serial; void numeroSerie; void location; void localizacao; void local; void status; void updatedAt; void createdAt;
    return extra;
  }

  private normalizeHistory(item: RecordItem, id: string, equipmentId: string): EquipmentHistory {
    return {
      ...item,
      id,
      equipmentId,
      clientId: this.text(item.clientId),
      projectId: this.text(item.projectId),
      date: this.text(item.date),
      type: this.text(item.type, 'Registro tecnico'),
      note: this.text(item.note),
    };
  }

  private extraHistory(history: RecordItem): RecordItem {
    const { id, equipmentId, clientId, projectId, date, type, note, updatedAt, createdAt, ...extra } = history;
    void id; void equipmentId; void clientId; void projectId; void date; void type; void note; void updatedAt; void createdAt;
    return extra;
  }

  private revision(value: unknown): number {
    const result = Number(value ?? 0);
    if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.');
    return result;
  }

  private async legacyList(cookie?: string): Promise<{ equipment: Equipment[]; equipmentHistory: EquipmentHistory[]; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura dos equipamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os equipamentos.');
    const payload = await upstream.json() as Aggregate;
    return {
      equipment: this.normalizeList(payload.data?.equipment),
      equipmentHistory: this.normalizeHistoryList(payload.data?.equipmentHistory),
      revision: payload.revision,
    };
  }

  private async legacySave(body: unknown, cookie?: string, expectedId?: string): Promise<{ status: number; body: string }> {
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

  private async legacySaveHistory(body: unknown, equipmentId: string, cookie?: string, expectedHistoryId?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de historico invalido.');
    const input = body as { history?: unknown; equipmentHistory?: unknown; baseRevision?: unknown };
    const history = this.record(input.history ?? input.equipmentHistory);
    if (!history) throw new BadRequestException('A gravacao precisa conter um historico valido.');
    const historyId = this.text(history.id) || `hist-${crypto.randomUUID()}`;
    if (expectedHistoryId && historyId !== expectedHistoryId) throw new BadRequestException('O identificador do historico nao confere.');
    const current = await this.readAggregate(cookie);
    const equipment = Array.isArray(current.data.equipment) ? current.data.equipment : [];
    if (!equipment.some((item) => this.sameId(item, equipmentId))) throw new NotFoundException('Equipamento nao encontrado.');
    const historyList = this.normalizeHistoryList(current.data.equipmentHistory);
    const index = historyList.findIndex((item) => item.id === (expectedHistoryId || historyId) && item.equipmentId === equipmentId);
    if (expectedHistoryId && index < 0) throw new NotFoundException('Historico nao encontrado.');
    if (!expectedHistoryId && historyList.some((item) => item.id === historyId)) throw new BadRequestException('Ja existe um historico com este identificador.');
    const normalized = this.normalizeHistory(history, expectedHistoryId || historyId, equipmentId);
    const nextHistory = expectedHistoryId
      ? historyList.map((item, itemIndex) => itemIndex === index ? { ...item, ...normalized, id: expectedHistoryId, equipmentId } : item)
      : [normalized, ...historyList];
    return this.forwardSave({ ...current.data, equipmentHistory: nextHistory }, input.baseRevision, cookie);
  }

  private async legacyRemoveHistory(equipmentId: string, historyId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de exclusao invalido.');
    const input = body as { baseRevision?: unknown };
    const current = await this.readAggregate(cookie);
    const historyList = this.normalizeHistoryList(current.data.equipmentHistory);
    if (!historyList.some((item) => item.id === historyId && item.equipmentId === equipmentId)) throw new NotFoundException('Historico nao encontrado.');
    return this.forwardSave({ ...current.data, equipmentHistory: historyList.filter((item) => !(item.id === historyId && item.equipmentId === equipmentId)) }, input.baseRevision, cookie);
  }

  private async readAggregate(cookie?: string): Promise<Aggregate & { data: Record<string, unknown> }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura dos equipamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a gravacao de equipamentos.');
    const payload = await upstream.json() as Aggregate;
    return { data: payload.data || {}, revision: payload.revision };
  }

  private async forwardSave(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do historico de equipamentos.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private normalizeList(value: unknown): Equipment[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object').map((item, index) => this.normalizeEquipment(item, this.text(item.id, `legacy-equipment-${index + 1}`)));
  }

  private normalizeHistoryList(value: unknown): EquipmentHistory[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object')
      .map((item, index) => this.normalizeHistory(item, this.text(item.id, `legacy-equipment-history-${index + 1}`), this.text(item.equipmentId)));
  }

  private record(value: unknown): RecordItem | null { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as RecordItem : null; }
  private sameId(value: unknown, expectedId: string): boolean { const item = this.record(value); return item !== null && this.text(item.id) === expectedId; }
  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
}
