"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ModuleLayout } from "../../components/ModuleLayout";
import { apiGet } from "../../../lib/api";

type Item = Record<string, unknown>;
type Payload = { data?: Record<string, Item[]> };

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiGet<Payload>("/api/data").then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao carregar o orçamento.")); }, []);
  const quote = payload?.data?.quotes?.find((item) => String(item.id) === id);
  const rooms = (payload?.data?.quoteRooms || []).filter((item) => String(item.quoteId) === id);
  return <ModuleLayout eyebrow="COMERCIAL" title={String(quote?.title || "Orçamento") } description="Detalhe do orçamento e ambientes vinculados.">{error && <p className="error">{error}</p>}{!error && !quote && <p>Orçamento não encontrado.</p>}{quote && <><p>Status: <strong>{String(quote.status || "Rascunho")}</strong> · Versão {String(quote.version || 1)}</p><section className="record-list">{rooms.map((room, index) => <article key={String(room.id || index)}><strong>{String(room.name || `Ambiente ${index + 1}`)}</strong><span>{Array.isArray(room.items) ? `${room.items.length} item(ns)` : "Nenhum item"}</span></article>)}{rooms.length === 0 && <p>Nenhum ambiente cadastrado.</p>}</section></>}</ModuleLayout>;
}
