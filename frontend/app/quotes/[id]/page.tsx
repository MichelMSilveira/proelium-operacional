"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ModuleLayout } from "../../components/ModuleLayout";
import { apiGet, apiPost, apiPut } from "../../../lib/api";

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
    ])
      .then(([resource, roomsResource, productsResource]) =>
        setPayload({
          revision: resource.revision,
          data: {
            quotes: resource.quote ? [resource.quote] : [],
            quoteRooms: roomsResource.rooms || [],
            products: productsResource.products || [],
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
  const products = payload?.data?.products || [];
  const total = rooms.reduce(
    (sum, room) =>
      sum +
      (Array.isArray(room.items)
        ? room.items.reduce((subtotal, item) => {
            const product = products.find(
              (entry) => String(entry.id) === String(item.productId),
            );
            const price = Number(
              product?.price || product?.salePrice || product?.valor || 0,
            );
            const qty = Math.max(0, Number(item.qty || 0));
            const discount = Math.min(
              100,
              Math.max(0, Number(item.discount || 0)),
            );
            return subtotal + price * qty * (1 - discount / 100);
          }, 0)
        : 0),
    0,
  );

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
    await persist([
      ...(payload.data.quoteRooms || []),
      { id: `amb-next-${crypto.randomUUID()}`, quoteId: id, name, items: [] },
    ]);
    event.currentTarget.reset();
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
    const quoteRooms = (payload.data.quoteRooms || []).map((room) =>
      room.id === roomId
        ? {
            ...room,
            items: [
              ...(Array.isArray(room.items) ? room.items : []),
              { productId, qty, discount },
            ],
          }
        : room,
    );
    await persist(quoteRooms);
    event.currentTarget.reset();
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
                  {Array.isArray(room.items)
                    ? `${room.items.length} item(ns)`
                    : "Nenhum item"}
                </span>
              </article>
            ))}
            {rooms.length === 0 && <p>Nenhum ambiente cadastrado.</p>}
          </section>
        </>
      )}
    </ModuleLayout>
  );
}
