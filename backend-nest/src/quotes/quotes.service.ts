import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export type Quote = { id: string; opportunityId: string; clientId: string; title: string; status: string; value: number; [key: string]: unknown };
export type QuoteRoom = { id: string; quoteId: string; name: string; items: Record<string, unknown>[]; [key: string]: unknown };
export type QuoteItem = { id: string; quoteId: string; roomId: string; productId: string; qty: number; discount: number; [key: string]: unknown };
export type QuotePackage = { id: string; name: string; category: string; description: string; active: boolean; items: Record<string, unknown>[]; [key: string]: unknown };
export type ProcurementRequest = { id: string; quoteId: string; roomId: string; productId: string; name: string; category: string; brand: string; status: string; createdAt: string; [key: string]: unknown };
type RecordItem = Record<string, unknown>;
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

@Injectable()
export class QuotesService {
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

  async list(cookie?: string): Promise<{ quotes: Quote[]; packages: QuotePackage[]; procurementRequests: ProcurementRequest[]; revision?: number }> {
    if (this.pool) return this.databaseList(cookie);
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de orçamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os orçamentos.');
    const payload = await upstream.json() as { revision?: number; data?: { quotes?: unknown; packages?: unknown; procurementRequests?: unknown } };
    return {
      quotes: this.normalizeList(payload.data?.quotes),
      packages: this.normalizePackages(payload.data?.packages),
      procurementRequests: this.normalizeProcurementRequests(payload.data?.procurementRequests),
      revision: payload.revision,
    };
  }

  async detail(id: string, cookie?: string): Promise<{ quote: Quote; revision?: number }> {
    if (!id.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    const result = await this.list(cookie);
    const quote = result.quotes.find((item) => item.id === id);
    if (!quote) throw new NotFoundException('Orcamento nao encontrado.');
    return { quote, revision: result.revision };
  }

  async rooms(quoteId: string, cookie?: string): Promise<QuoteRoom[]> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [quote, rooms] = await Promise.all([
        this.pool.query('select id from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]),
        this.pool.query(
          `select id, quote_id as "quoteId", name, items, extra_data as "extraData"
           from quotes_domain_rooms where company_id = $1 and quote_id = $2 order by updated_at asc, name asc`,
          [context.companyId, quoteId],
        ),
      ]);
      if (!quote.rowCount) throw new NotFoundException('Orcamento nao encontrado.');
      return rooms.rows.map((row) => this.roomFromRow(row));
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura dos ambientes.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel carregar os ambientes do orcamento.');
    const payload = await upstream.json() as { data?: { quoteRooms?: unknown } };
    return this.normalizeRooms(payload.data?.quoteRooms).filter((room) => room.quoteId === quoteId);
  }

  async items(quoteId: string, cookie?: string): Promise<{ items: QuoteItem[]; revision?: number }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (this.pool) {
      const context = await this.authContext(cookie);
      const [quote, rooms, state] = await Promise.all([
        this.pool.query('select id from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]),
        this.pool.query(
          `select id, quote_id as "quoteId", items
           from quotes_domain_rooms where company_id = $1 and quote_id = $2 order by updated_at asc, name asc`,
          [context.companyId, quoteId],
        ),
        this.pool.query('select revision from quotes_domain_state where company_id = $1', [context.companyId]),
      ]);
      if (!quote.rowCount) throw new NotFoundException('Orcamento nao encontrado.');
      const items = rooms.rows.flatMap((room) => {
        const roomItems: unknown[] = Array.isArray(room.items) ? room.items : [];
        return roomItems.map((item: unknown, index: number) => this.normalizeItem(item, quoteId, this.text(room.id), index));
      });
      return { items, revision: Number(state.rows[0]?.revision || 0) };
    }
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    if (!quotes.some((item) => this.sameId(item, quoteId))) throw new NotFoundException('Orcamento nao encontrado.');
    const rooms = this.normalizeRooms(current.data.quoteRooms).filter((room) => room.quoteId === quoteId);
    const items = rooms.flatMap((room) => room.items.map((item, index) => this.normalizeItem(item, quoteId, room.id, index)));
    return { items, revision: current.revision };
  }

  async addItem(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de item invalido.');
    const input = body as { item?: unknown; baseRevision?: unknown };
    const item = this.record(input.item);
    if (!item) throw new BadRequestException('A criacao precisa conter um item valido.');
    if (this.pool) return this.databaseAddItem(quoteId, item, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    if (!quotes.some((entry) => this.sameId(entry, quoteId))) throw new NotFoundException('Orcamento nao encontrado.');
    const roomId = this.text(item.roomId);
    const productId = this.text(item.productId);
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const roomIndex = rooms.findIndex((entry) => this.sameId(entry, roomId) && this.text(this.record(entry)?.quoteId) === quoteId);
    if (roomIndex < 0) throw new NotFoundException('Ambiente do orcamento nao encontrado.');
    const products = Array.isArray(current.data.products) ? current.data.products : [];
    if (!products.some((entry) => this.sameId(entry, productId))) throw new NotFoundException('Produto ou servico nao encontrado.');
    const qty = this.number(item.qty);
    const discount = this.number(item.discount);
    if (qty <= 0) throw new BadRequestException('A quantidade do item deve ser maior que zero.');
    if (discount > 100) throw new BadRequestException('O desconto do item deve estar entre zero e cem por cento.');
    const nextItem: QuoteItem = {
      ...item,
      id: this.text(item.id, `item-${crypto.randomUUID()}`),
      quoteId,
      roomId,
      productId,
      qty,
      discount,
    };
    const room = this.record(rooms[roomIndex]) || {};
    const existingItems = Array.isArray(room.items) ? room.items : [];
    if (existingItems.some((entry) => this.text(this.record(entry)?.id) === nextItem.id)) throw new BadRequestException('Ja existe um item com este identificador.');
    const nextRooms = rooms.map((entry, index) => index === roomIndex ? { ...this.record(entry), items: [...existingItems, nextItem] } : entry);
    return this.forward({ ...current.data, quoteRooms: nextRooms }, input.baseRevision ?? current.revision, cookie);
  }

  async updateItem(quoteId: string, itemId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim() || !itemId.trim()) throw new BadRequestException('O identificador do item e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de item invalido.');
    const input = body as { item?: unknown; baseRevision?: unknown };
    const item = this.record(input.item);
    if (!item) throw new BadRequestException('A atualizacao precisa conter um item valido.');
    if (this.pool) return this.databaseUpdateItem(quoteId, itemId, item, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const locations = rooms.map((entry, roomIndex) => {
      const room = this.record(entry) || {};
      const roomId = this.text(room.id);
      const existingItems = Array.isArray(room.items) ? room.items : [];
      const itemIndex = this.text(room.quoteId) === quoteId ? existingItems.findIndex((candidate, index) => this.normalizeItem(candidate, quoteId, roomId, index).id === itemId) : -1;
      return { room, roomId, existingItems, roomIndex, itemIndex };
    });
    const location = locations.find((entry) => entry.itemIndex >= 0);
    if (!location) throw new NotFoundException('Item do orcamento nao encontrado.');
    const existing = this.normalizeItem(location.existingItems[location.itemIndex], quoteId, location.roomId, location.itemIndex);
    const productId = this.text(item.productId, existing.productId);
    const products = Array.isArray(current.data.products) ? current.data.products : [];
    if (!products.some((entry) => this.sameId(entry, productId))) throw new NotFoundException('Produto ou servico nao encontrado.');
    const qty = this.number(item.qty ?? existing.qty);
    const discount = this.number(item.discount ?? existing.discount);
    if (qty <= 0) throw new BadRequestException('A quantidade do item deve ser maior que zero.');
    if (discount > 100) throw new BadRequestException('O desconto do item deve estar entre zero e cem por cento.');
    const nextItem: QuoteItem = { ...existing, ...item, id: itemId, quoteId, roomId: location.roomId, productId, qty, discount };
    const nextRooms = rooms.map((entry, roomIndex) => roomIndex === location.roomIndex
      ? { ...location.room, items: location.existingItems.map((candidate, itemIndex) => itemIndex === location.itemIndex ? nextItem : candidate) }
      : entry);
    return this.forward({ ...current.data, quoteRooms: nextRooms }, input.baseRevision ?? current.revision, cookie);
  }

  async deleteItem(quoteId: string, itemId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim() || !itemId.trim()) throw new BadRequestException('O identificador do item e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    if (this.pool) return this.databaseDeleteItem(quoteId, itemId, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    let foundRoomIndex = -1;
    let foundItemIndex = -1;
    const nextRooms = rooms.map((entry, roomIndex) => {
      const room = this.record(entry) || {};
      const roomId = this.text(room.id);
      const existingItems = Array.isArray(room.items) ? room.items : [];
      const itemIndex = this.text(room.quoteId) === quoteId ? existingItems.findIndex((candidate, index) => this.normalizeItem(candidate, quoteId, roomId, index).id === itemId) : -1;
      if (itemIndex < 0) return entry;
      foundRoomIndex = roomIndex;
      foundItemIndex = itemIndex;
      return { ...room, items: existingItems.filter((_, index) => index !== itemIndex) };
    });
    if (foundRoomIndex < 0 || foundItemIndex < 0) throw new NotFoundException('Item do orcamento nao encontrado.');
    return this.forward({ ...current.data, quoteRooms: nextRooms }, input.baseRevision ?? current.revision, cookie);
  }

  async createRoom(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ambiente invalido.');
    const input = body as { room?: unknown; baseRevision?: unknown };
    const room = this.record(input.room);
    if (!room) throw new BadRequestException('A criacao precisa conter um ambiente valido.');
    const name = this.text(room.name);
    if (!name) throw new BadRequestException('O ambiente precisa conter um nome.');
    if (this.pool) return this.databaseCreateRoom(quoteId, room, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    if (!quotes.some((entry) => this.sameId(entry, quoteId))) throw new NotFoundException('Orcamento nao encontrado.');
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const quoteRooms = rooms.filter((entry) => this.text(this.record(entry)?.quoteId) === quoteId);
    if (quoteRooms.some((entry) => this.text(this.record(entry)?.name).toLowerCase() === name.toLowerCase())) throw new BadRequestException('Ja existe um ambiente com este nome no orcamento.');
    const roomId = this.text(room.id, `amb-${crypto.randomUUID()}`);
    if (rooms.some((entry) => this.sameId(entry, roomId))) throw new BadRequestException('Ja existe um ambiente com este identificador.');
    const nextRoom: QuoteRoom = { ...room, id: roomId, quoteId, name, items: [] };
    return this.forward({ ...current.data, quoteRooms: [...rooms, nextRoom] }, input.baseRevision ?? current.revision, cookie);
  }

  async updateRoom(quoteId: string, roomId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim() || !roomId.trim()) throw new BadRequestException('O identificador do ambiente e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ambiente invalido.');
    const input = body as { room?: unknown; baseRevision?: unknown };
    const room = this.record(input.room);
    if (!room) throw new BadRequestException('A atualizacao precisa conter um ambiente valido.');
    const name = this.text(room.name);
    if (!name) throw new BadRequestException('O ambiente precisa conter um nome.');
    if (this.pool) return this.databaseUpdateRoom(quoteId, roomId, room, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const index = rooms.findIndex((entry) => this.sameId(entry, roomId) && this.text(this.record(entry)?.quoteId) === quoteId);
    if (index < 0) throw new NotFoundException('Ambiente nao encontrado.');
    if (rooms.some((entry, entryIndex) => entryIndex !== index && this.text(this.record(entry)?.quoteId) === quoteId && this.text(this.record(entry)?.name).toLowerCase() === name.toLowerCase())) throw new BadRequestException('Ja existe um ambiente com este nome no orcamento.');
    const existing = this.record(rooms[index]) || {};
    const nextRooms = rooms.map((entry, entryIndex) => entryIndex === index ? { ...existing, id: roomId, quoteId, name } : entry);
    return this.forward({ ...current.data, quoteRooms: nextRooms }, input.baseRevision ?? current.revision, cookie);
  }

  async deleteRoom(quoteId: string, roomId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim() || !roomId.trim()) throw new BadRequestException('O identificador do ambiente e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    if (this.pool) return this.databaseDeleteRoom(quoteId, roomId, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const index = rooms.findIndex((entry) => this.sameId(entry, roomId) && this.text(this.record(entry)?.quoteId) === quoteId);
    if (index < 0) throw new NotFoundException('Ambiente nao encontrado.');
    const existing = this.record(rooms[index]) || {};
    if (Array.isArray(existing.items) && existing.items.length) throw new BadRequestException('Remova os itens do ambiente antes de exclui-lo.');
    return this.forward({ ...current.data, quoteRooms: rooms.filter((_, entryIndex) => entryIndex !== index) }, input.baseRevision ?? current.revision, cookie);
  }

  async saveRooms(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de ambientes invalido.');
    const input = body as { rooms?: unknown; baseRevision?: unknown };
    if (!Array.isArray(input.rooms)) throw new BadRequestException('A gravacao precisa conter rooms como lista.');
    if (input.rooms.some((room) => !room || typeof room !== 'object' || String((room as { quoteId?: unknown }).quoteId || '') !== quoteId)) {
      throw new BadRequestException('Todos os ambientes precisam pertencer ao orcamento informado.');
    }
    if (this.pool) {
      return this.databaseSaveRooms(quoteId, input.rooms, input.baseRevision, cookie);
    }
    const currentResponse = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao dos ambientes.');
    });
    const currentBody = await currentResponse.text();
    if (!currentResponse.ok) return { status: currentResponse.status, body: currentBody };
    let currentPayload: { data?: Record<string, unknown> };
    try {
      currentPayload = JSON.parse(currentBody) as { data?: Record<string, unknown> };
    } catch {
      throw new ServiceUnavailableException('Resposta invalida do backend legado.');
    }
    const currentData = currentPayload.data && typeof currentPayload.data === 'object' ? currentPayload.data : {};
    const currentRooms = Array.isArray(currentData.quoteRooms) ? currentData.quoteRooms : [];
    const otherRooms = currentRooms.filter((room) => !room || typeof room !== 'object' || String((room as { quoteId?: unknown }).quoteId || '') !== quoteId);
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data: { ...currentData, quoteRooms: [...otherRooms, ...input.rooms] }, baseRevision: input.baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao dos ambientes.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  async approve(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (this.pool) return this.databaseApprove(quoteId, body, cookie);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de aprovacao invalido.');
    const input = body as { data?: Record<string, unknown>; baseRevision?: unknown };
    const data = input.data || (await this.readAggregate(cookie)).data;
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];
    const rooms = Array.isArray(data.quoteRooms) ? data.quoteRooms : [];
    const products = Array.isArray(data.products) ? data.products : [];
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const quote = quotes.find((item) => Boolean(item) && typeof item === 'object' && String((item as { id?: unknown }).id || '') === quoteId) as Record<string, unknown> | undefined;
    if (!quote) throw new NotFoundException('Orcamento nao encontrado.');
    const quoteRooms = rooms.filter((item) => Boolean(item) && typeof item === 'object' && String((item as { quoteId?: unknown }).quoteId || '') === quoteId) as Record<string, unknown>[];
    let cost = 0;
    let price = 0;
    quoteRooms.forEach((room) => {
      const items = Array.isArray(room.items) ? room.items : [];
      items.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const product = products.find((entry) => Boolean(entry) && typeof entry === 'object' && String((entry as { id?: unknown }).id || '') === String((item as { productId?: unknown }).productId || '')) as Record<string, unknown> | undefined;
        if (!product) return;
        const quantity = this.number((item as { qty?: unknown }).qty);
        const discount = Math.min(100, this.number((item as { discount?: unknown }).discount));
        const productCost = this.number(product.cost);
        const productPrice = this.number(product.price || product.salePrice || product.valor);
        cost += productCost * quantity;
        price += productPrice * quantity * (1 - discount / 100);
      });
    });
    if (!price) throw new BadRequestException('Adicione ao menos um item com preco para aprovar este orcamento.');
    let client = quote.clientId ? clients.find((item) => Boolean(item) && typeof item === 'object' && String((item as { id?: unknown }).id || '') === String(quote.clientId)) as Record<string, unknown> | undefined : undefined;
    const opportunity = quote.opportunityId ? opportunities.find((item) => Boolean(item) && typeof item === 'object' && String((item as { id?: unknown }).id || '') === String(quote.opportunityId)) as Record<string, unknown> | undefined : undefined;
    if (!client && opportunity) {
      client = {
        id: `cli-${crypto.randomUUID()}`,
        name: this.text(opportunity.company, 'Cliente sem nome'),
        document: '',
        contact: this.text(opportunity.contact),
        email: this.text(opportunity.email),
        phone: this.text(opportunity.phone),
        address: '',
        city: '',
        notes: `Origem: oportunidade comercial (${this.text(opportunity.source, 'nao informada')}).`,
        status: 'Ativo',
      };
      clients.push(client);
    }
    if (!client) throw new BadRequestException('Vincule um cliente ou uma oportunidade antes de aprovar.');
    quote.clientId = client.id;
    quote.value = Number(price.toFixed(2));
    quote.status = 'Aprovado';
    if (opportunity) {
      opportunity.stage = 'Ganho';
      opportunity.estimatedValue = Number(price.toFixed(2));
      opportunity.lossReason = '';
    }
    let project = projects.find((item) => Boolean(item) && typeof item === 'object' && String((item as { quoteId?: unknown }).quoteId || '') === quoteId) as Record<string, unknown> | undefined;
    if (!project) {
      project = {
        id: `prj-${crypto.randomUUID()}`,
        quoteId,
        code: `PRJ-${String(projects.length + 1).padStart(3, '0')}`,
        name: this.text(quote.title, 'Projeto').replace(/^Proposta\s+[—-]\s*/, ''),
        clientId: client.id,
        manager: this.text(opportunity?.owner, 'A definir'),
        technicalStage: 'Projeto t\u00e9cnico',
        budget: Number(price.toFixed(2)),
        cost: Number(cost.toFixed(2)),
        status: 'Planejamento',
        progress: 0,
        due: 'A definir',
      };
      projects.push(project);
    } else {
      project.budget = Number(price.toFixed(2));
      project.cost = Number(cost.toFixed(2));
    }
    return this.save({ data, baseRevision: input.baseRevision }, cookie);
  }

  private async databaseApprove(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de aprovacao invalido.');
    const input = body as { baseRevision?: unknown };
    const expectedRevision = this.revision(input.baseRevision);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== expectedRevision) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const quoteResult = await client.query(
        `select id, opportunity_id as "opportunityId", client_id as "clientId", title, status, value, extra_data as "extraData"
         from quotes_domain_entries where company_id = $1 and id = $2`,
        [context.companyId, quoteId],
      );
      const quote = quoteResult.rows[0] as RecordItem | undefined;
      if (!quote) throw new NotFoundException('Orcamento nao encontrado.');
      const roomResult = await client.query(
        `select id, quote_id as "quoteId", name, items, extra_data as "extraData"
         from quotes_domain_rooms where company_id = $1 and quote_id = $2`,
        [context.companyId, quoteId],
      );
      const rooms = roomResult.rows as RecordItem[];
      const productIds = [...new Set(rooms.flatMap((room) => Array.isArray(room.items)
        ? room.items.map((item) => this.text(this.record(item)?.productId)).filter(Boolean)
        : []))];
      const productsResult = productIds.length
        ? await client.query(
          `select id, price, extra_data as "extraData" from products_domain_entries
           where company_id = $1 and id = any($2::text[])`,
          [context.companyId, productIds],
        )
        : { rows: [] as RecordItem[] };
      const products = new Map(productsResult.rows.map((row) => [this.text(row.id), row]));
      let cost = 0;
      let price = 0;
      for (const room of rooms) {
        const items = Array.isArray(room.items) ? room.items : [];
        for (const item of items) {
          const record = this.record(item);
          if (!record) continue;
          const product = products.get(this.text(record.productId));
          if (!product) continue;
          const extra = this.record(product.extraData) || {};
          const quantity = this.number(record.qty);
          const discount = Math.min(100, this.number(record.discount));
          const productCost = this.number(extra.cost ?? extra.costPrice ?? extra.custo);
          const productPrice = this.number(product.price ?? extra.price ?? extra.salePrice ?? extra.valor);
          cost += productCost * quantity;
          price += productPrice * quantity * (1 - discount / 100);
        }
      }
      if (!price) throw new BadRequestException('Adicione ao menos um item com preco para aprovar este orcamento.');

      const opportunityId = this.text(quote.opportunityId);
      const opportunityRevision = opportunityId
        ? await this.lockDomainRevision(client, 'opportunities_domain_state', 'proelium:opportunities', context.companyId)
        : 0;
      const opportunityResult = opportunityId
        ? await client.query(
          `select id, company, contact, phone, email, owner, source, extra_data as "extraData"
           from opportunities_domain_entries where company_id = $1 and id = $2`,
          [context.companyId, opportunityId],
        )
        : { rows: [] as RecordItem[] };
      const opportunity = opportunityResult.rows[0] as RecordItem | undefined;
      const requestedClientId = this.text(quote.clientId);
      const existingClientResult = requestedClientId
        ? await client.query(
          `select id, name, document, email, phone, address, extra_data as "extraData"
           from clients_domain_entries where company_id = $1 and id = $2`,
          [context.companyId, requestedClientId],
        )
        : { rows: [] as RecordItem[] };
      let clientRecord = existingClientResult.rows[0] as RecordItem | undefined;
      let clientCreated = false;
      if (!clientRecord && opportunity) {
        const clientId = `cli-${crypto.randomUUID()}`;
        clientRecord = {
          id: clientId,
          name: this.text(opportunity.company, 'Cliente sem nome'),
          document: '',
          email: this.text(opportunity.email),
          phone: this.text(opportunity.phone),
          address: '',
          extraData: {
            contact: this.text(opportunity.contact),
            city: '',
            notes: `Origem: oportunidade comercial (${this.text(opportunity.source, 'nao informada')}).`,
            status: 'Ativo',
          },
        };
        await this.lockDomainRevision(client, 'clients_domain_state', 'proelium:clients', context.companyId);
        await client.query(
          `insert into clients_domain_entries
            (company_id, id, name, document, email, phone, address, extra_data, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
          [context.companyId, clientRecord.id, clientRecord.name, clientRecord.document, clientRecord.email,
            clientRecord.phone, clientRecord.address, JSON.stringify(clientRecord.extraData)],
        );
        clientCreated = true;
      }
      if (!clientRecord) throw new BadRequestException('Vincule um cliente ou uma oportunidade antes de aprovar.');
      const clientId = this.text(clientRecord.id);

      await client.query(
        `update quotes_domain_entries
         set client_id = $1, value = $2, status = 'Aprovado', updated_at = now()
         where company_id = $3 and id = $4`,
        [clientId, Number(price.toFixed(2)), context.companyId, quoteId],
      );
      if (opportunity) {
        await client.query(
          `update opportunities_domain_entries
           set stage = 'Ganho', estimated_value = $1, loss_reason = '', updated_at = now()
           where company_id = $2 and id = $3`,
          [Number(price.toFixed(2)), context.companyId, opportunity.id],
        );
      }

      await this.lockDomainRevision(client, 'projects_domain_state', 'proelium:projects', context.companyId);
      const projectResult = await client.query(
        `select id, name, client_id as "clientId", budget, extra_data as "extraData"
         from projects_domain_entries where company_id = $1 and extra_data->>'quoteId' = $2 limit 1`,
        [context.companyId, quoteId],
      );
      let project = projectResult.rows[0] as RecordItem | undefined;
      let projectCreated = false;
      const projectBudget = Number(price.toFixed(2));
      const projectCost = Number(cost.toFixed(2));
      if (!project) {
        const countResult = await client.query('select count(*)::int as count from projects_domain_entries where company_id = $1', [context.companyId]);
        const code = `PRJ-${String(Number(countResult.rows[0]?.count || 0) + 1).padStart(3, '0')}`;
        const projectId = `prj-${crypto.randomUUID()}`;
        const projectName = this.text(quote.title, 'Projeto').replace(/^Proposta\s+[—-]\s*/, '');
        const extraData = { quoteId, code, cost: projectCost, due: 'A definir' };
        await client.query(
          `insert into projects_domain_entries
            (company_id, id, name, client_id, technical_stage, status, manager, progress, budget, extra_data, updated_at)
           values ($1, $2, $3, $4, 'Projeto técnico', 'Planejamento', $5, 0, $6, $7::jsonb, now())`,
          [context.companyId, projectId, projectName, clientId, this.text(opportunity?.owner, 'A definir'), projectBudget, JSON.stringify(extraData)],
        );
        project = { id: projectId, name: projectName, clientId, budget: projectBudget, extraData };
        projectCreated = true;
      } else {
        const extraData = { ...(this.record(project.extraData) || {}), cost: projectCost };
        await client.query(
          `update projects_domain_entries set budget = $1, client_id = $2, extra_data = $3::jsonb, updated_at = now()
           where company_id = $4 and id = $5`,
          [projectBudget, clientId, JSON.stringify(extraData), context.companyId, project.id],
        );
      }
      const nextRevision = await this.bumpRevision(client, context.companyId);
      const nextOpportunityRevision = opportunity
        ? await this.bumpDomainRevision(client, 'opportunities_domain_state', context.companyId)
        : opportunityRevision;
      const nextClientsRevision = clientCreated
        ? await this.bumpDomainRevision(client, 'clients_domain_state', context.companyId)
        : undefined;
      const nextProjectsRevision = await this.bumpDomainRevision(client, 'projects_domain_state', context.companyId);
      await client.query('commit');
      return {
        status: 200,
        body: JSON.stringify({ ok: true, revision: nextRevision, quoteId, clientId, projectId: this.text(project.id), cost: projectCost, price: projectBudget, opportunityRevision: nextOpportunityRevision, clientsRevision: nextClientsRevision, projectsRevision: nextProjectsRevision, projectCreated }),
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createFromResource(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de criacao invalido.');
    const input = body as { quote?: unknown; baseRevision?: unknown };
    const quote = this.record(input.quote);
    if (!quote || !String(quote.id || '')) throw new BadRequestException('A criacao precisa conter um orcamento valido.');
    if (this.pool) return this.databaseCreateQuote(quote, input.baseRevision, cookie);
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    if (quotes.some((item) => this.sameId(item, String(quote.id)))) throw new BadRequestException('Ja existe um orcamento com este identificador.');
    return this.save({ data: { ...current.data, quotes: [...quotes, quote] }, baseRevision: input.baseRevision }, cookie);
  }

  async updateQuote(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de orcamento invalido.');
    if (this.pool) return this.databaseUpdateQuote(quoteId, body, cookie);
    const input = body as { quote?: unknown; baseRevision?: unknown };
    const quote = this.record(input.quote);
    if (!quote) throw new BadRequestException('A atualizacao precisa conter um orcamento valido.');
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    const index = quotes.findIndex((entry) => this.sameId(entry, quoteId));
    if (index < 0) throw new NotFoundException('Orcamento nao encontrado.');
    const existing = this.record(quotes[index]) || {};
    const title = this.text(quote.title, this.text(existing.title));
    if (!title) throw new BadRequestException('O orcamento precisa conter um titulo.');
    const clientId = this.text(quote.clientId, this.text(existing.clientId));
    if (clientId) {
      const clients = Array.isArray(current.data.clients) ? current.data.clients : [];
      if (!clients.some((entry) => this.sameId(entry, clientId))) throw new NotFoundException('Cliente nao encontrado.');
    }
    const nextQuote = {
      ...existing,
      id: quoteId,
      title,
      clientId,
      validUntil: this.text(quote.validUntil, this.text(existing.validUntil)),
      version: Math.max(1, this.number(existing.version) + 1),
      updatedAt: new Date().toISOString(),
    };
    const nextQuotes = quotes.map((entry, entryIndex) => entryIndex === index ? nextQuote : entry);
    return this.forward({ ...current.data, quotes: nextQuotes }, input.baseRevision ?? current.revision, cookie);
  }

  async deleteQuote(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    const input = body && typeof body === 'object' ? body as { baseRevision?: unknown } : {};
    if (this.pool) return this.databaseDeleteQuote(quoteId, input, cookie);
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    const quote = quotes.find((entry) => this.sameId(entry, quoteId));
    if (!quote) throw new NotFoundException('Orcamento nao encontrado.');
    const quoteRecord = this.record(quote) || {};
    if (this.text(quoteRecord.status).toLowerCase() === 'aprovado') throw new BadRequestException('Orcamentos aprovados nao podem ser excluidos.');
    const rooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
    const relatedRooms = rooms.filter((entry) => this.text(this.record(entry)?.quoteId) === quoteId);
    if (relatedRooms.some((entry) => Array.isArray(this.record(entry)?.items) && (this.record(entry)?.items as unknown[]).length)) throw new BadRequestException('Remova os itens antes de excluir o orcamento.');
    return this.forward({ ...current.data, quotes: quotes.filter((entry) => !this.sameId(entry, quoteId)), quoteRooms: rooms.filter((entry) => this.text(this.record(entry)?.quoteId) !== quoteId) }, input.baseRevision ?? current.revision, cookie);
  }

  private async databaseUpdateQuote(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const input = body as { quote?: unknown; baseRevision?: unknown };
    const quote = this.record(input.quote);
    if (!quote) throw new BadRequestException('A atualizacao precisa conter um orcamento valido.');
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existingResult = await client.query(
        `select id, opportunity_id as "opportunityId", client_id as "clientId", title, status, value, extra_data as "extraData"
         from quotes_domain_entries where company_id = $1 and id = $2 for update`,
        [context.companyId, quoteId],
      );
      const existingRow = existingResult.rows[0] as RecordItem | undefined;
      if (!existingRow) throw new NotFoundException('Orcamento nao encontrado.');
      const existing = this.quoteFromRow(existingRow);
      const title = this.text(quote.title, existing.title);
      if (!title) throw new BadRequestException('O orcamento precisa conter um titulo.');
      const clientId = this.text(quote.clientId, existing.clientId);
      if (clientId) {
        const owner = await client.query('select id from clients_domain_entries where company_id = $1 and id = $2', [context.companyId, clientId]);
        if (!owner.rowCount) throw new NotFoundException('Cliente nao encontrado.');
      }
      const nextQuote = {
        ...existing,
        id: quoteId,
        title,
        clientId,
        validUntil: this.text(quote.validUntil, this.text(existing.validUntil)),
        version: Math.max(1, this.number(existing.version) + 1),
        updatedAt: new Date().toISOString(),
      };
      await client.query(
        `update quotes_domain_entries
         set client_id = $1, title = $2, extra_data = $3::jsonb, updated_at = now()
         where company_id = $4 and id = $5`,
        [clientId, title, JSON.stringify(this.extraQuote(nextQuote)), context.companyId, quoteId],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, quote: this.normalizeQuote(nextQuote, quoteId) }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseCreateQuote(quote: RecordItem, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const quoteId = this.text(quote.id);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existing = await client.query('select id from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]);
      if (existing.rowCount) throw new BadRequestException('Ja existe um orcamento com este identificador.');
      const opportunityId = this.text(quote.opportunityId);
      if (opportunityId) {
        const opportunity = await client.query('select id from opportunities_domain_entries where company_id = $1 and id = $2', [context.companyId, opportunityId]);
        if (!opportunity.rowCount) throw new NotFoundException('Oportunidade nao encontrada.');
      }
      const clientId = this.text(quote.clientId);
      if (clientId) {
        const owner = await client.query('select id from clients_domain_entries where company_id = $1 and id = $2', [context.companyId, clientId]);
        if (!owner.rowCount) throw new NotFoundException('Cliente nao encontrado.');
      }
      const normalized = this.normalizeQuote(quote, quoteId);
      await client.query(
        `insert into quotes_domain_entries
          (company_id, id, opportunity_id, client_id, title, status, value, extra_data, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
        [context.companyId, normalized.id, normalized.opportunityId, normalized.clientId, normalized.title, normalized.status, normalized.value, JSON.stringify(this.extraQuote(quote))],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 201, body: JSON.stringify({ ok: true, revision: nextRevision, quote: normalized }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseDeleteQuote(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const input = body as { baseRevision?: unknown };
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(input.baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const quote = await client.query('select id, status from quotes_domain_entries where company_id = $1 and id = $2 for update', [context.companyId, quoteId]);
      if (!quote.rowCount) throw new NotFoundException('Orcamento nao encontrado.');
      if (this.text(quote.rows[0].status).toLowerCase() === 'aprovado') throw new BadRequestException('Orcamentos aprovados nao podem ser excluidos.');
      const rooms = await client.query('select id, items from quotes_domain_rooms where company_id = $1 and quote_id = $2', [context.companyId, quoteId]);
      if (rooms.rows.some((room) => Array.isArray(room.items) && room.items.length)) {
        throw new BadRequestException('Remova os itens antes de excluir o orcamento.');
      }
      await client.query('delete from quotes_domain_rooms where company_id = $1 and quote_id = $2', [context.companyId, quoteId]);
      await client.query('delete from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]);
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, id: quoteId }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseCreateRoom(quoteId: string, room: RecordItem, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const quote = await client.query('select id from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]);
      if (!quote.rowCount) throw new NotFoundException('Orcamento nao encontrado.');
      const rooms = await client.query('select id, name from quotes_domain_rooms where company_id = $1 and quote_id = $2', [context.companyId, quoteId]);
      const name = this.text(room.name);
      if (rooms.rows.some((entry) => this.text(entry.name).toLowerCase() === name.toLowerCase())) throw new BadRequestException('Ja existe um ambiente com este nome no orcamento.');
      const roomId = this.text(room.id, `amb-${crypto.randomUUID()}`);
      const duplicate = await client.query('select id from quotes_domain_rooms where company_id = $1 and id = $2', [context.companyId, roomId]);
      if (duplicate.rowCount) throw new BadRequestException('Ja existe um ambiente com este identificador.');
      const nextRoom = this.normalizeRoom({ ...room, id: roomId, quoteId, name, items: [] }, roomId);
      await client.query(
        `insert into quotes_domain_rooms (company_id, id, quote_id, name, items, extra_data, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, now())`,
        [context.companyId, nextRoom.id, quoteId, nextRoom.name, JSON.stringify(nextRoom.items), JSON.stringify(this.extraRoom(room))],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 201, body: JSON.stringify({ ok: true, revision: nextRevision, room: nextRoom }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseAddItem(quoteId: string, item: RecordItem, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const quote = await client.query('select id from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]);
      if (!quote.rowCount) throw new NotFoundException('Orcamento nao encontrado.');
      const roomId = this.text(item.roomId);
      const roomResult = await client.query('select id, items from quotes_domain_rooms where company_id = $1 and id = $2 and quote_id = $3 for update', [context.companyId, roomId, quoteId]);
      const room = roomResult.rows[0] as RecordItem | undefined;
      if (!room) throw new NotFoundException('Ambiente do orcamento nao encontrado.');
      const productId = this.text(item.productId);
      const product = await client.query('select id from products_domain_entries where company_id = $1 and id = $2', [context.companyId, productId]);
      if (!product.rowCount) throw new NotFoundException('Produto ou servico nao encontrado.');
      const qty = this.number(item.qty);
      const discount = this.number(item.discount);
      if (qty <= 0) throw new BadRequestException('A quantidade do item deve ser maior que zero.');
      if (discount > 100) throw new BadRequestException('O desconto do item deve estar entre zero e cem por cento.');
      const nextItem: QuoteItem = { ...item, id: this.text(item.id, `item-${crypto.randomUUID()}`), quoteId, roomId, productId, qty, discount };
      const existingItems: unknown[] = Array.isArray(room.items) ? room.items : [];
      if (existingItems.some((entry) => this.text(this.record(entry)?.id) === nextItem.id)) throw new BadRequestException('Ja existe um item com este identificador.');
      await client.query('update quotes_domain_rooms set items = $1::jsonb, updated_at = now() where company_id = $2 and id = $3 and quote_id = $4', [JSON.stringify([...existingItems, nextItem]), context.companyId, roomId, quoteId]);
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 201, body: JSON.stringify({ ok: true, revision: nextRevision, item: nextItem }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseUpdateItem(quoteId: string, itemId: string, item: RecordItem, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const rooms = await client.query('select id, items from quotes_domain_rooms where company_id = $1 and quote_id = $2 for update', [context.companyId, quoteId]);
      let selectedRoom: RecordItem | undefined;
      let selectedIndex = -1;
      let selectedItems: unknown[] = [];
      for (const row of rooms.rows as RecordItem[]) {
        const items: unknown[] = Array.isArray(row.items) ? row.items : [];
        const index = items.findIndex((entry, entryIndex) => this.normalizeItem(entry, quoteId, this.text(row.id), entryIndex).id === itemId);
        if (index >= 0) {
          selectedRoom = row;
          selectedIndex = index;
          selectedItems = items;
          break;
        }
      }
      if (!selectedRoom || selectedIndex < 0) throw new NotFoundException('Item do orcamento nao encontrado.');
      const existing = this.normalizeItem(selectedItems[selectedIndex], quoteId, this.text(selectedRoom.id), selectedIndex);
      const productId = this.text(item.productId, existing.productId);
      const product = await client.query('select id from products_domain_entries where company_id = $1 and id = $2', [context.companyId, productId]);
      if (!product.rowCount) throw new NotFoundException('Produto ou servico nao encontrado.');
      const qty = this.number(item.qty ?? existing.qty);
      const discount = this.number(item.discount ?? existing.discount);
      if (qty <= 0) throw new BadRequestException('A quantidade do item deve ser maior que zero.');
      if (discount > 100) throw new BadRequestException('O desconto do item deve estar entre zero e cem por cento.');
      const nextItem: QuoteItem = { ...existing, ...item, id: itemId, quoteId, roomId: this.text(selectedRoom.id), productId, qty, discount };
      const nextItems = selectedItems.map((entry, index) => index === selectedIndex ? nextItem : entry);
      await client.query('update quotes_domain_rooms set items = $1::jsonb, updated_at = now() where company_id = $2 and id = $3 and quote_id = $4', [JSON.stringify(nextItems), context.companyId, selectedRoom.id, quoteId]);
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, item: nextItem }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseDeleteItem(quoteId: string, itemId: string, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const rooms = await client.query('select id, items from quotes_domain_rooms where company_id = $1 and quote_id = $2 for update', [context.companyId, quoteId]);
      let selectedRoom: RecordItem | undefined;
      let selectedIndex = -1;
      let selectedItems: unknown[] = [];
      for (const row of rooms.rows as RecordItem[]) {
        const items: unknown[] = Array.isArray(row.items) ? row.items : [];
        const index = items.findIndex((entry, entryIndex) => this.normalizeItem(entry, quoteId, this.text(row.id), entryIndex).id === itemId);
        if (index >= 0) {
          selectedRoom = row;
          selectedIndex = index;
          selectedItems = items;
          break;
        }
      }
      if (!selectedRoom || selectedIndex < 0) throw new NotFoundException('Item do orcamento nao encontrado.');
      const nextItems = selectedItems.filter((_, index) => index !== selectedIndex);
      await client.query('update quotes_domain_rooms set items = $1::jsonb, updated_at = now() where company_id = $2 and id = $3 and quote_id = $4', [JSON.stringify(nextItems), context.companyId, selectedRoom.id, quoteId]);
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, id: itemId }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseUpdateRoom(quoteId: string, roomId: string, room: RecordItem, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const existingResult = await client.query(
        `select id, quote_id as "quoteId", name, items, extra_data as "extraData"
         from quotes_domain_rooms where company_id = $1 and id = $2 and quote_id = $3 for update`,
        [context.companyId, roomId, quoteId],
      );
      const existingRow = existingResult.rows[0] as RecordItem | undefined;
      if (!existingRow) throw new NotFoundException('Ambiente nao encontrado.');
      const name = this.text(room.name);
      const siblings = await client.query('select id, name from quotes_domain_rooms where company_id = $1 and quote_id = $2 and id <> $3', [context.companyId, quoteId, roomId]);
      if (siblings.rows.some((entry) => this.text(entry.name).toLowerCase() === name.toLowerCase())) throw new BadRequestException('Ja existe um ambiente com este nome no orcamento.');
      const existing = this.roomFromRow(existingRow);
      const nextRoom = { ...existing, id: roomId, quoteId, name };
      await client.query(
        `update quotes_domain_rooms set name = $1, extra_data = $2::jsonb, updated_at = now()
         where company_id = $3 and id = $4 and quote_id = $5`,
        [name, JSON.stringify({ ...(this.record(existingRow.extraData) || {}), ...this.extraRoom(room) }), context.companyId, roomId, quoteId],
      );
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, room: nextRoom }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseDeleteRoom(quoteId: string, roomId: string, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const room = await client.query('select id, items from quotes_domain_rooms where company_id = $1 and id = $2 and quote_id = $3 for update', [context.companyId, roomId, quoteId]);
      if (!room.rowCount) throw new NotFoundException('Ambiente nao encontrado.');
      if (Array.isArray(room.rows[0].items) && room.rows[0].items.length) throw new BadRequestException('Remova os itens do ambiente antes de exclui-lo.');
      await client.query('delete from quotes_domain_rooms where company_id = $1 and id = $2 and quote_id = $3', [context.companyId, roomId, quoteId]);
      const nextRevision = await this.bumpRevision(client, context.companyId);
      await client.query('commit');
      return { status: 200, body: JSON.stringify({ ok: true, revision: nextRevision, id: roomId }) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async databaseSaveRooms(quoteId: string, roomsInput: unknown[], baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const rooms = roomsInput.map((item) => {
      const room = this.record(item) || {};
      const roomId = this.text(room.id, `amb-${crypto.randomUUID()}`);
      return this.normalizeRoom({ ...room, id: roomId, quoteId, name: this.text(room.name), items: Array.isArray(room.items) ? room.items : [] }, roomId);
    });
    if (rooms.some((room) => !room.name)) throw new BadRequestException('O ambiente precisa conter um nome.');
    if (new Set(rooms.map((room) => room.id)).size !== rooms.length) throw new BadRequestException('Os ambientes precisam ter identificadores unicos.');
    const names = rooms.map((room) => room.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new BadRequestException('Ja existe um ambiente com este nome no orcamento.');
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== this.revision(baseRevision)) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      const quote = await client.query('select id from quotes_domain_entries where company_id = $1 and id = $2', [context.companyId, quoteId]);
      if (!quote.rowCount) throw new NotFoundException('Orcamento nao encontrado.');
      const duplicate = await client.query(
        'select id from quotes_domain_rooms where company_id = $1 and id = any($2::text[]) and quote_id <> $3',
        [context.companyId, rooms.map((room) => room.id), quoteId],
      );
      if (duplicate.rowCount) throw new BadRequestException('Ja existe um ambiente com este identificador.');
      await client.query('delete from quotes_domain_rooms where company_id = $1 and quote_id = $2', [context.companyId, quoteId]);
      for (const room of rooms) {
        await client.query(
          `insert into quotes_domain_rooms (company_id, id, quote_id, name, items, extra_data, updated_at)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, now())`,
          [context.companyId, room.id, quoteId, room.name, JSON.stringify(room.items), JSON.stringify(this.extraRoom(room))],
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

  private async databaseList(cookie?: string): Promise<{ quotes: Quote[]; packages: QuotePackage[]; procurementRequests: ProcurementRequest[]; revision?: number }> {
    const context = await this.authContext(cookie);
    const [quotes, packages, procurementRequests, state] = await Promise.all([
      this.pool!.query(
        `select id, opportunity_id as "opportunityId", client_id as "clientId", title, status, value, extra_data as "extraData"
         from quotes_domain_entries where company_id = $1 order by updated_at desc, title asc`,
        [context.companyId],
      ),
      this.pool!.query(
        `select id, name, category, description, active, items, extra_data as "extraData"
         from quotes_domain_packages where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool!.query(
        `select id, quote_id as "quoteId", room_id as "roomId", product_id as "productId", name, category, brand, status,
                request_date as "createdAt", extra_data as "extraData"
         from quotes_domain_procurement_requests where company_id = $1 order by updated_at desc, request_date desc`,
        [context.companyId],
      ),
      this.pool!.query('select revision from quotes_domain_state where company_id = $1', [context.companyId]),
    ]);
    return {
      quotes: quotes.rows.map((row) => this.quoteFromRow(row)),
      packages: packages.rows.map((row) => this.packageFromRow(row)),
      procurementRequests: procurementRequests.rows.map((row) => this.procurementFromRow(row)),
      revision: Number(state.rows[0]?.revision || 0),
    };
  }

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown>; revision?: number }> {
    return this.readLegacyAggregate(cookie);
  }

  private async readLegacyAggregate(cookie?: string): Promise<{ data: Record<string, unknown>; revision?: number }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para leitura de orcamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Nao foi possivel preparar a criacao de orcamentos.');
    const payload = await upstream.json() as { data?: Record<string, unknown>; revision?: number };
    return { data: payload.data || {}, revision: payload.revision };
  }

  private async forward(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (this.pool) return this.databaseForward(data, baseRevision, cookie);
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do item.');
    });
    return { status: upstream.status, body: await upstream.text() };
  }

  private async databaseForward(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const context = await this.authContext(cookie);
    this.ensureWritePermission(context);
    const expectedRevision = this.revision(baseRevision);
    const state = await this.pool!.query('select revision from quotes_domain_state where company_id = $1', [context.companyId]);
    const currentRevision = Number(state.rows[0]?.revision || 0);
    if (currentRevision !== expectedRevision) return this.conflict(currentRevision);
    const [existingPackages, existingProcurementRequests] = await Promise.all([
      this.pool!.query(
        `select id, name, category, description, active, items, extra_data as "extraData"
         from quotes_domain_packages where company_id = $1 order by updated_at desc, name asc`,
        [context.companyId],
      ),
      this.pool!.query(
        `select id, quote_id as "quoteId", room_id as "roomId", product_id as "productId", name, category, brand, status,
                request_date as "createdAt", extra_data as "extraData"
         from quotes_domain_procurement_requests where company_id = $1 order by updated_at desc, request_date desc`,
        [context.companyId],
      ),
    ]);
    const packages = Array.isArray(data.packages) ? data.packages : existingPackages.rows.map((row) => this.packageFromRow(row));
    const procurementRequests = Array.isArray(data.procurementRequests) ? data.procurementRequests : existingProcurementRequests.rows.map((row) => this.procurementFromRow(row));
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];
    const rooms = Array.isArray(data.quoteRooms) ? data.quoteRooms : [];
    const client = await this.pool!.connect();
    try {
      await client.query('begin');
      const currentRevision = await this.lockRevision(client, context.companyId);
      if (currentRevision !== expectedRevision) {
        await client.query('rollback');
        return this.conflict(currentRevision);
      }
      await client.query('delete from quotes_domain_rooms where company_id = $1', [context.companyId]);
      await client.query('delete from quotes_domain_entries where company_id = $1', [context.companyId]);
      await client.query('delete from quotes_domain_packages where company_id = $1', [context.companyId]);
      await client.query('delete from quotes_domain_procurement_requests where company_id = $1', [context.companyId]);
      for (const item of quotes) {
        const quote = this.normalizeQuote(this.record(item) || {}, this.text(this.record(item)?.id));
        if (!quote.id) continue;
        await client.query(
          `insert into quotes_domain_entries (company_id, id, opportunity_id, client_id, title, status, value, extra_data, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
          [context.companyId, quote.id, quote.opportunityId, quote.clientId, quote.title, quote.status, quote.value, JSON.stringify(this.extraQuote(this.record(item) || {}))],
        );
      }
      for (const item of rooms) {
        const room = this.normalizeRoom(this.record(item) || {}, this.text(this.record(item)?.id));
        if (!room.id || !room.quoteId) continue;
        await client.query(
          `insert into quotes_domain_rooms (company_id, id, quote_id, name, items, extra_data, updated_at)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, now())`,
          [context.companyId, room.id, room.quoteId, room.name, JSON.stringify(room.items), JSON.stringify(this.extraRoom(this.record(item) || {}))],
        );
      }
      for (const item of packages) {
        const pack = this.normalizePackage(this.record(item) || {}, this.text(this.record(item)?.id));
        if (!pack.id) continue;
        await client.query(
          `insert into quotes_domain_packages (company_id, id, name, category, description, active, items, extra_data, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())`,
          [context.companyId, pack.id, pack.name, pack.category, pack.description, pack.active, JSON.stringify(pack.items), JSON.stringify(this.extraPackage(this.record(item) || {}))],
        );
      }
      for (const item of procurementRequests) {
        const request = this.normalizeProcurement(this.record(item) || {}, this.text(this.record(item)?.id));
        if (!request.id) continue;
        await client.query(
          `insert into quotes_domain_procurement_requests
            (company_id, id, quote_id, room_id, product_id, name, category, brand, status, request_date, extra_data, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())`,
          [context.companyId, request.id, request.quoteId, request.roomId, request.productId, request.name, request.category, request.brand, request.status, request.createdAt, JSON.stringify(this.extraProcurement(this.record(item) || {}))],
        );
      }
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
    if (role !== 'admin' && !permissions.includes('*') && !permissions.includes('quotes') && !modules.includes('quotes') && !modules.includes('commercial')) {
      throw new ForbiddenException('Seu perfil nao possui acesso aos orcamentos.');
    }
    return { username: this.text(user.username, 'unknown'), companyId: this.text(user.companyId, 'legacy') || 'legacy', role: role || 'leitura', permissions, modules };
  }

  private ensureWritePermission(context: AuthContext): void {
    if (context.role !== 'admin' && context.role !== 'comercial') throw new ForbiddenException('Seu perfil nao pode alterar orcamentos.');
  }

  private async lockRevision(client: PoolClient, companyId: string): Promise<number> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`proelium:quotes:${companyId}`]);
    const result = await client.query('select revision from quotes_domain_state where company_id = $1 for update', [companyId]);
    if (result.rowCount) return Number(result.rows[0].revision);
    await client.query('insert into quotes_domain_state (company_id, revision) values ($1, 0)', [companyId]);
    return 0;
  }

  private async bumpRevision(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query('update quotes_domain_state set revision = revision + 1, updated_at = now() where company_id = $1 returning revision', [companyId]);
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

  private conflict(revision: number): { status: number; body: string } { return { status: 409, body: JSON.stringify({ conflict: true, revision, error: 'Os dados foram alterados por outro usuario.' }) }; }
  private revision(value: unknown): number { const result = Number(value ?? 0); if (!Number.isInteger(result) || result < 0) throw new BadRequestException('Revisao invalida.'); return result; }

  private record(value: unknown): Record<string, unknown> | null {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private sameId(value: unknown, expectedId: string): boolean {
    const item = this.record(value);
    return item !== null && String(item.id || '') === expectedId;
  }

  async save(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (this.pool) {
      if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravação inválido.');
      const input = body as { data?: { quotes?: unknown }; baseRevision?: unknown };
      if (!input.data || typeof input.data !== 'object' || !Array.isArray(input.data.quotes)) {
        throw new BadRequestException('A gravação precisa conter data.quotes como lista.');
      }
      return this.forward(input.data as Record<string, unknown>, input.baseRevision, cookie);
    }
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de gravação inválido.');
    const input = body as { data?: { quotes?: unknown }; baseRevision?: unknown };
    if (!input.data || typeof input.data !== 'object' || !Array.isArray(input.data.quotes)) {
      throw new BadRequestException('A gravação precisa conter data.quotes como lista.');
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data: input.data, baseRevision: input.baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para gravação de orçamentos.');
    });
    const result = await upstream.text();
    return { status: upstream.status, body: result };
  }

  private quoteFromRow(row: RecordItem): Quote {
    return this.normalizeQuote({ ...(this.record(row.extraData) || {}), id: row.id, opportunityId: row.opportunityId, clientId: row.clientId, title: row.title, status: row.status, value: row.value }, this.text(row.id));
  }

  private roomFromRow(row: RecordItem): QuoteRoom {
    return this.normalizeRoom({ ...(this.record(row.extraData) || {}), id: row.id, quoteId: row.quoteId, name: row.name, items: row.items }, this.text(row.id));
  }

  private packageFromRow(row: RecordItem): QuotePackage {
    return this.normalizePackage({ ...(this.record(row.extraData) || {}), id: row.id, name: row.name, category: row.category, description: row.description, active: row.active, items: row.items }, this.text(row.id));
  }

  private procurementFromRow(row: RecordItem): ProcurementRequest {
    return this.normalizeProcurement({ ...(this.record(row.extraData) || {}), id: row.id, quoteId: row.quoteId, roomId: row.roomId, productId: row.productId, name: row.name, category: row.category, brand: row.brand, status: row.status, createdAt: row.createdAt }, this.text(row.id));
  }

  private normalizeQuote(item: RecordItem, id: string): Quote {
    return {
      ...item,
      id,
      opportunityId: this.text(item.opportunityId),
      clientId: this.text(item.clientId),
      title: this.text(item.title, 'Orçamento sem título'),
      status: this.text(item.status, 'Em elaboração'),
      value: this.number(item.value),
    };
  }

  private normalizeRoom(item: RecordItem, id: string): QuoteRoom {
    return {
      ...item,
      id,
      quoteId: this.text(item.quoteId),
      name: this.text(item.name, 'Ambiente sem nome'),
      items: Array.isArray(item.items) ? item.items.filter((entry): entry is RecordItem => Boolean(entry) && typeof entry === 'object') : [],
    };
  }

  private normalizePackage(item: RecordItem, id: string): QuotePackage {
    return {
      ...item,
      id,
      name: this.text(item.name, 'Pacote sem nome'),
      category: this.text(item.category),
      description: this.text(item.description),
      active: item.active !== false,
      items: Array.isArray(item.items) ? item.items.filter((entry): entry is RecordItem => Boolean(entry) && typeof entry === 'object') : [],
    };
  }

  private normalizeProcurement(item: RecordItem, id: string): ProcurementRequest {
    return {
      ...item,
      id,
      quoteId: this.text(item.quoteId),
      roomId: this.text(item.roomId),
      productId: this.text(item.productId),
      name: this.text(item.name, 'Item a cotar'),
      category: this.text(item.category, 'A cotar'),
      brand: this.text(item.brand),
      status: this.text(item.status, 'A cotar'),
      createdAt: this.text(item.createdAt, new Date().toISOString()),
    };
  }

  private extraQuote(item: RecordItem): RecordItem {
    const { id, opportunityId, clientId, title, status, value, updatedAt, createdAt, ...extra } = item;
    void id; void opportunityId; void clientId; void title; void status; void value; void updatedAt; void createdAt;
    return extra;
  }

  private extraRoom(item: RecordItem): RecordItem {
    const { id, quoteId, name, items, updatedAt, createdAt, ...extra } = item;
    void id; void quoteId; void name; void items; void updatedAt; void createdAt;
    return extra;
  }

  private extraPackage(item: RecordItem): RecordItem {
    const { id, name, category, description, active, items, updatedAt, createdAt, ...extra } = item;
    void id; void name; void category; void description; void active; void items; void updatedAt; void createdAt;
    return extra;
  }

  private extraProcurement(item: RecordItem): RecordItem {
    const { id, quoteId, roomId, productId, name, category, brand, status, createdAt, updatedAt, ...extra } = item;
    void id; void quoteId; void roomId; void productId; void name; void category; void brand; void status; void createdAt; void updatedAt;
    return extra;
  }

  private normalizeList(value: unknown): Quote[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item, id: this.text(item.id, `legacy-quote-${index + 1}`), opportunityId: this.text(item.opportunityId),
      clientId: this.text(item.clientId), title: this.text(item.title, 'Orçamento sem título'),
      status: this.text(item.status, 'Em elaboração'), value: this.number(item.value),
    }));
  }

  private normalizeRooms(value: unknown): QuoteRoom[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item, index) => ({
      ...item,
      id: this.text(item.id, `legacy-room-${index + 1}`),
      quoteId: this.text(item.quoteId),
      name: this.text(item.name, 'Ambiente sem nome'),
      items: Array.isArray(item.items) ? item.items.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object') : [],
    }));
  }

  private normalizePackages(value: unknown): QuotePackage[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object')
      .map((item, index) => this.normalizePackage(item, this.text(item.id, `legacy-package-${index + 1}`)));
  }

  private normalizeProcurementRequests(value: unknown): ProcurementRequest[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object')
      .map((item, index) => this.normalizeProcurement(item, this.text(item.id, `legacy-procurement-${index + 1}`)));
  }

  private normalizeItem(value: unknown, quoteId: string, roomId: string, index: number): QuoteItem {
    const item = this.record(value) || {};
    return {
      ...item,
      id: this.text(item.id, `legacy-item-${roomId}-${index + 1}`),
      quoteId,
      roomId,
      productId: this.text(item.productId),
      qty: this.number(item.qty),
      discount: Math.min(100, this.number(item.discount)),
    };
  }

  private text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value); }
  private number(value: unknown): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
}
