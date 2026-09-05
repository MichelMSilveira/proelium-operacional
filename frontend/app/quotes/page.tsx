"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModuleLayout } from "../components/ModuleLayout";
import { apiGet, apiPut } from "../../lib/api";

type Item = Record<string, unknown>;
type Payload = { revision?: number; data?: Record<string, Item[]> };

export default function QuotesPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { apiGet<Payload>("/api/data").then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao carregar orçamentos.")); }, []);
  async function createQuote(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!payload?.data) return; const values = Object.fromEntries(new FormData(event.currentTarget)); const title = String(values.title || "").trim(); if (!title) return; const quote = { id: `orc-next-${crypto.randomUUID()}`, title, clientId: String(values.clientId || ""), validUntil: String(values.validUntil || ""), status: "Rascunho", value: 0, version: 1, createdAt: new Date().toISOString() }; const quotes = [...(payload.data.quotes || []), quote]; setSaving(true); setError(""); try { const result = await apiPut<{ revision?: number }>("/api/data", { data: { ...payload.data, quotes }, baseRevision: payload.revision || 0 }); setPayload({ revision: result.revision, data: { ...payload.data, quotes } }); event.currentTarget.reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar o orçamento."); } finally { setSaving(false); } }
  const clients = payload?.data?.clients || []; const quotes = payload?.data?.quotes || [];
  return <ModuleLayout eyebrow="COMERCIAL" title="Orçamentos" description="Criação de rascunhos preservando cliente, validade e versão.">{error && <p className="error">{error}</p>}<form className="create-form" onSubmit={createQuote}><input name="title" placeholder="Nome da proposta / orçamento" required /><select name="clientId" defaultValue=""><option value="">Cliente (opcional)</option>{clients.map((client, index) => <option key={String(client.id || index)} value={String(client.id || "")}>{String(client.name || client.nome || "Cliente")}</option>)}</select><input name="validUntil" type="date" /><button disabled={saving}>{saving ? "Salvando…" : "Criar rascunho"}</button></form><div className="record-list">{quotes.map((quote, index) => <article key={String(quote.id || index)}><a href={`/quotes/${String(quote.id)}`}><strong>{String(quote.title || quote.name || `Orçamento ${index + 1}`)}</strong></a><span>{String(quote.status || "Rascunho")} · v{String(quote.version || 1)}</span></article>)}{!error && quotes.length === 0 && <p>Nenhum orçamento disponível.</p>}</div></ModuleLayout>;
}
