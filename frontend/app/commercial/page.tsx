"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModuleLayout } from "../components/ModuleLayout";
import { apiGet, apiPut } from "../../lib/api";

type Item = Record<string, unknown>;
type Payload = { revision?: number; data?: Record<string, Item[]> };

export default function CommercialPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { apiGet<Payload>("/api/data").then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao carregar comercial.")); }, []);
  async function createOpportunity(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!payload?.data) return; const title = String(new FormData(event.currentTarget).get("title") || "").trim(); if (!title) return; const opportunities = [...(payload.data.opportunities || []), { id: `opp-next-${crypto.randomUUID()}`, title, status: "Nova" }]; setSaving(true); setError(""); try { const result = await apiPut<{ revision?: number }>("/api/data", { data: { ...payload.data, opportunities }, baseRevision: payload.revision || 0 }); setPayload({ revision: result.revision, data: { ...payload.data, opportunities } }); event.currentTarget.reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao criar oportunidade."); } finally { setSaving(false); } }
  const list = (key: string, title: string) => <section className="group"><h2>{title}</h2>{payload?.data?.[key]?.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || item.nome || `${title} ${index + 1}`)}</strong><span>{String(item.status || item.stage || item.etapa || "Sem status informado")}</span></article>)}{!error && !payload?.data?.[key]?.length && <p>Nenhum registro disponível.</p>}</section>;
  return <ModuleLayout eyebrow="COMERCIAL" title="Comercial" description="Oportunidades e orçamentos em migração incremental.">{error && <p className="error">{error}</p>}<form className="create-form" onSubmit={createOpportunity}><input name="title" placeholder="Título da oportunidade" required /><button disabled={saving}>{saving ? "Salvando…" : "Adicionar oportunidade"}</button></form>{list("opportunities", "Oportunidades")}{list("quotes", "Orçamentos")}<style jsx>{`.group{padding:10px 0}.group h2{font:500 23px Georgia,serif}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.group span,.group>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
