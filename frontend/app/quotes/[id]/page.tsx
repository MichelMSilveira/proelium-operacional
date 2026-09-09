"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ModuleLayout } from "../../components/ModuleLayout";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../../../lib/api";

type Item = Record<string, unknown>;
type Payload = { revision?: number; data?: Record<string, Item[]> };

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet<{ quote?: Item; revision?: number }>(`/api/quotes/${id}`),
      apiGet<{ rooms?: Item[] }>(`/api/quotes/${id}/rooms`),
      apiGet<{ products?: Item[] }>("/api/products"),
      apiGet<{ services?: Item[] }>("/api/services"),
      apiGet<{ items?: Item[]; revision?: number }>(`/api/quotes/${id}/items`),
    ])
      .then(([resource, roomsResource, productsResource, servicesResource, itemsResource]) =>
        setPayload({
          revision: itemsResource.revision ?? resource.revision,
          data: {
            quotes: resource.quote ? [resource.quote] : [],
            quoteRooms: roomsResource.rooms || [],
            products: productsResource.products || [],
            services: servicesResource.services || [],
            items: itemsResource.items || [],
          },
        }),
      )
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar o orçamento.",
        ),
      );
  }, [id]);

  const quote = payload?.data?.quotes?.find((item) => String(item.id) === id);
  const rooms = (payload?.data?.quoteRooms || []).filter(
    (item) => String(item.quoteId) === id,
  );
  const products = [...(payload?.data?.products || []), ...(payload?.data?.services || [])].filter((item, index, list) => list.findIndex((entry) => String(entry.id) === String(item.id)) === index);
  const items = payload?.data?.items || [];
  const total = items.reduce((sum, item) => {
    const product = products.find((entry) => String(entry.id) === String(item.productId));
    const price = Number(product?.price || product?.salePrice || product?.valor || 0);
    const qty = Math.max(0, Number(item.qty || 0));
    const discount = Math.min(100, Math.max(0, Number(item.discount || 0)));
    return sum + price * qty * (1 - discount / 100);
  }, 0);

  async function persist(quoteRooms: Item[]) {
    if (!payload?.data) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiPut<{ revision?: number }>(`/api/quotes/${id}/rooms`, {
        rooms: quoteRooms.filter((room) => String(room.quoteId) === id),
        baseRevision: payload.revision || 0,
      });
      setPayload({
        revision: result.revision,
        data: { ...payload.data, quoteRooms },
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o orçamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload?.data) return;
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    if (!name) return;
    const room = { id: `amb-next-${crypto.randomUUID()}`, quoteId: id, name, items: [] };
    setSaving(true);
    setError("");
    try {
      const result = await apiPost<{ revision?: number }>(`/api/quotes/${id}/rooms`, { room, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, data: { ...payload.data, quoteRooms: [...(payload.data.quoteRooms || []), room] } });
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel criar o ambiente.");
    } finally {
      setSaving(false);
    }
  }

  async function editRoom(room: Item) {
    if (!payload?.data) return;
    const name = window.prompt("Nome do ambiente", String(room.name || ""))?.trim();
    if (!name || name === String(room.name || "")) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/quotes/${id}/rooms/${encodeURIComponent(String(room.id))}`, { room: { id: room.id, quoteId: id, name }, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, data: { ...payload.data, quoteRooms: (payload.data.quoteRooms || []).map((entry) => entry.id === room.id ? { ...entry, name } : entry) } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel renomear o ambiente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoom(room: Item) {
    if (!payload?.data || !window.confirm(`Excluir o ambiente ${String(room.name || "sem nome")}?`)) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiDelete<{ revision?: number }>(`/api/quotes/${id}/rooms/${encodeURIComponent(String(room.id))}`, { baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, data: { ...payload.data, quoteRooms: (payload.data.quoteRooms || []).filter((entry) => entry.id !== room.id) } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel excluir o ambiente.");
    } finally {
      setSaving(false);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload?.data || !rooms.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const roomId = String(values.roomId);
    const productId = String(values.productId);
    const qty = Math.max(1, Number(values.qty || 1));
    const discount = Math.min(
      100,
      Math.max(0, Number(values.discount || 0)),
    );
    const item = { id: `item-next-${crypto.randomUUID()}`, quoteId: id, roomId, productId, qty, discount };
    setSaving(true);
    setError("");
    try {
      const result = await apiPost<{ revision?: number }>(`/api/quotes/${id}/items`, { item, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, data: { ...payload.data, items: [...(payload.data.items || []), item] } });
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel adicionar o item.");
    } finally {
      setSaving(false);
    }
  }

  function productName(productId: string) {
    const product = products.find((entry) => String(entry.id) === productId);
    return String(product?.name || product?.nome || "Item");
  }

  async function editItem(item: Item) {
    if (!payload?.data) return;
    const qtyValue = window.prompt("Quantidade", String(item.qty || 1));
    if (qtyValue === null) return;
    const discountValue = window.prompt("Desconto (%)", String(item.discount || 0));
    if (discountValue === null) return;
    const qty = Math.max(1, Number(qtyValue || 1));
    const discount = Math.min(100, Math.max(0, Number(discountValue || 0)));
    if (!Number.isFinite(qty) || !Number.isFinite(discount)) {
      setError("Informe quantidade e desconto validos.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/quotes/${id}/items/${encodeURIComponent(String(item.id))}`, { item: { id: item.id, productId: item.productId, qty, discount }, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, data: { ...payload.data, items: (payload.data.items || []).map((entry) => entry.id === item.id ? { ...entry, qty, discount } : entry) } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel editar o item.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: Item) {
    if (!payload?.data || !window.confirm(`Excluir ${productName(String(item.productId))} deste orcamento?`)) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiDelete<{ revision?: number }>(`/api/quotes/${id}/items/${encodeURIComponent(String(item.id))}`, { baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, data: { ...payload.data, items: (payload.data.items || []).filter((entry) => entry.id !== item.id) } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel excluir o item.");
    } finally {
      setSaving(false);
    }
  }

  async function approveQuote() {
    if (!payload?.data || !quote || String(quote.status || "") === "Aprovado") return;
    if (!window.confirm("Aprovar este orcamento e criar ou vincular cliente e projeto?")) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiPost<{ revision?: number }>(`/api/quotes/${id}/approve`, { baseRevision: payload.revision || 0 });
      setPayload({
        revision: result.revision,
        data: {
          ...payload.data,
          quotes: (payload.data.quotes || []).map((item) =>
            String(item.id) === id ? { ...item, status: "Aprovado" } : item,
          ),
        },
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Nao foi possivel aprovar o orcamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModuleLayout
      eyebrow="COMERCIAL"
      title={String(quote?.title || "Orçamento")}
      description="Detalhe do orçamento, ambientes, itens e totais."
    >
      {error && <p className="error">{error}</p>}
      {!error && !quote && <p>Orçamento não encontrado.</p>}
      {quote && (
        <>
          {String(quote.status || "") !== "Aprovado" && (
            <button type="button" disabled={saving} onClick={approveQuote}>
              Aprovar orçamento
            </button>
          )}
          <p>
            Status: <strong>{String(quote.status || "Rascunho")}</strong> ·
            Versão {String(quote.version || 1)}
          </p>
          <p>
            <strong>
              Total calculado: {total.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </strong>
          </p>
          <form className="create-form" onSubmit={createRoom}>
            <input name="name" placeholder="Nome do ambiente" required />
            <button disabled={saving}>
              {saving ? "Salvando…" : "Adicionar ambiente"}
            </button>
          </form>
          {rooms.length > 0 && (
            <form className="create-form" onSubmit={addItem}>
              <select name="roomId" defaultValue={String(rooms[0].id)}>
                {rooms.map((room, index) => (
                  <option
                    key={String(room.id || index)}
                    value={String(room.id)}
                  >
                    {String(room.name || `Ambiente ${index + 1}`)}
                  </option>
                ))}
              </select>
              <select name="productId" required defaultValue="">
                <option value="">Produto/serviço</option>
                {products.map((product, index) => (
                  <option
                    key={String(product.id || index)}
                    value={String(product.id)}
                  >
                    {String(product.name || product.nome || "Item")}
                  </option>
                ))}
              </select>
              <input name="qty" type="number" min="1" defaultValue="1" />
              <input
                name="discount"
                type="number"
                min="0"
                max="100"
                defaultValue="0"
                placeholder="Desconto %"
              />
              <button disabled={saving}>Adicionar item</button>
            </form>
          )}
          <section className="record-list">
            {rooms.map((room, index) => (
              <article key={String(room.id || index)}>
                <strong>{String(room.name || `Ambiente ${index + 1}`)}</strong>
                <span>
                  {`${items.filter((item) => String(item.roomId) === String(room.id)).length} item(ns)`}
                </span>
                <button type="button" disabled={saving} onClick={() => editRoom(room)}>Renomear</button>
                <button type="button" disabled={saving} onClick={() => deleteRoom(room)}>Excluir</button>
                {items.filter((item) => String(item.roomId) === String(room.id)).map((item) => <div key={String(item.id)}><span>{productName(String(item.productId))} · {String(item.qty)} un · {String(item.discount || 0)}% desconto</span><button type="button" disabled={saving} onClick={() => editItem(item)}>Editar item</button><button type="button" disabled={saving} onClick={() => deleteItem(item)}>Excluir item</button></div>)}
              </article>
            ))}
            {rooms.length === 0 && <p>Nenhum ambiente cadastrado.</p>}
          </section>
        </>
      )}
    </ModuleLayout>
  );
}
