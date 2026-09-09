import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export type Quote = { id: string; opportunityId: string; clientId: string; title: string; status: string; value: number; [key: string]: unknown };
export type QuoteRoom = { id: string; quoteId: string; name: string; items: Record<string, unknown>[]; [key: string]: unknown };
export type QuoteItem = { id: string; quoteId: string; roomId: string; productId: string; qty: number; discount: number; [key: string]: unknown };
type RecordItem = Record<string, unknown>;
type AuthContext = { username: string; companyId: string; role: string; permissions: string[]; modules: string[] };

@Injectable()
export class QuotesService {
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

  async list(cookie?: string): Promise<{ quotes: Quote[]; revision?: number }> {
    if (this.pool) {
      const current = await this.readAggregate(cookie);
      return { quotes: this.normalizeList(current.data.quotes), revision: current.revision };
    }
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, { headers: cookie ? { cookie } : {} }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponível para leitura de orçamentos.');
    });
    if (!upstream.ok) throw new ServiceUnavailableException('Não foi possível carregar os orçamentos.');
    const payload = await upstream.json() as { revision?: number; data?: { quotes?: unknown } };
    return { quotes: this.normalizeList(payload.data?.quotes), revision: payload.revision };
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
      const current = await this.readAggregate(cookie);
      const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
      if (!quotes.some((item) => this.sameId(item, quoteId))) throw new NotFoundException('Orcamento nao encontrado.');
      return this.normalizeRooms(current.data.quoteRooms).filter((room) => room.quoteId === quoteId);
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
      const current = await this.readAggregate(cookie);
      const currentRooms = Array.isArray(current.data.quoteRooms) ? current.data.quoteRooms : [];
      const otherRooms = currentRooms.filter((room) => !room || typeof room !== 'object' || String((room as { quoteId?: unknown }).quoteId || '') !== quoteId);
      return this.forward({ ...current.data, quoteRooms: [...otherRooms, ...input.rooms] }, input.baseRevision ?? current.revision, cookie);
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

  async createFromResource(body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de criacao invalido.');
    const input = body as { quote?: unknown; baseRevision?: unknown };
    const quote = this.record(input.quote);
    if (!quote || !String(quote.id || '')) throw new BadRequestException('A criacao precisa conter um orcamento valido.');
    const current = await this.readAggregate(cookie);
    const quotes = Array.isArray(current.data.quotes) ? current.data.quotes : [];
    if (quotes.some((item) => this.sameId(item, String(quote.id)))) throw new BadRequestException('Ja existe um orcamento com este identificador.');
    return this.save({ data: { ...current.data, quotes: [...quotes, quote] }, baseRevision: input.baseRevision }, cookie);
  }

  async updateQuote(quoteId: string, body: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    if (!quoteId.trim()) throw new BadRequestException('O identificador do orcamento e obrigatorio.');
    if (!body || typeof body !== 'object') throw new BadRequestException('Corpo de orcamento invalido.');
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

  private async readAggregate(cookie?: string): Promise<{ data: Record<string, unknown>; revision?: number }> {
    if (this.pool) {
      const context = await this.authContext(cookie);
      const legacy = await this.readLegacyAggregate(cookie);
      const [quotes, rooms, state] = await Promise.all([
        this.pool.query(
          `select id, opportunity_id as "opportunityId", client_id as "clientId", title, status, value, extra_data as "extraData"
           from quotes_domain_entries where company_id = $1 order by updated_at desc, title asc`,
          [context.companyId],
        ),
        this.pool.query(
          `select id, quote_id as "quoteId", name, items, extra_data as "extraData"
           from quotes_domain_rooms where company_id = $1 order by updated_at asc, name asc`,
          [context.companyId],
        ),
        this.pool.query('select revision from quotes_domain_state where company_id = $1', [context.companyId]),
      ]);
      return {
        data: {
          ...legacy.data,
          quotes: quotes.rows.map((row) => this.quoteFromRow(row)),
          quoteRooms: rooms.rows.map((row) => this.roomFromRow(row)),
        },
        revision: Number(state.rows[0]?.revision || 0),
      };
    }
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
    const legacy = await this.readLegacyAggregate(cookie);
    const legacyData = { ...legacy.data, quotes: data.quotes, quoteRooms: data.quoteRooms };
    const legacyResult = await this.forwardLegacy(legacyData, legacy.revision, cookie);
    if (legacyResult.status >= 400) return legacyResult;
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

  private async forwardLegacy(data: Record<string, unknown>, baseRevision: unknown, cookie?: string): Promise<{ status: number; body: string }> {
    const upstream = await fetch(`${this.legacyOrigin}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ data, baseRevision }),
    }).catch(() => {
      throw new ServiceUnavailableException('Backend legado indisponivel para gravacao do orcamento.');
    });
    return { status: upstream.status, body: await upstream.text() };
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
