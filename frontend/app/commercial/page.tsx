'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;
type Payload = { revision?: number; opportunities: Item[]; quotes: Item[] };
type OpportunitiesPayload = { opportunities?: Item[]; revision?: number };
type QuotesPayload = { quotes?: Item[] };

export default function CommercialPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiGet<OpportunitiesPayload>('/api/opportunities'), apiGet<QuotesPayload>('/api/quotes')])
      .then(([opportunities, quotes]) => setPayload({
        revision: opportunities.revision,
        opportunities: opportunities.opportunities || [],
        quotes: quotes.quotes || [],
      }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar comercial.'));
  }, []);

  async function persist(opportunities: Item[], opportunityId: string) {
    if (!payload) return;
    const opportunity = opportunities.find((item) => String(item.id) === opportunityId);
    if (!opportunity) return;
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/opportunities/${opportunityId}`, { opportunity, baseRevision: payload.revision || 0 });
      setPayload({ ...payload, revision: result.revision, opportunities });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar oportunidade.');
    } finally { setSaving(false); }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const title = String(new FormData(event.currentTarget).get('title') || '').trim();
    if (!title) return;
    const opportunity = { id: `opp-next-${crypto.randomUUID()}`, title, status: 'Nova' };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/opportunities', { opportunity, baseRevision: payload.revision || 0 });
      setPayload({ ...payload, revision: result.revision, opportunities: [...payload.opportunities, opportunity] });
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar oportunidade.');
    } finally { setSaving(false); }
  }

  async function editOpportunity(item: Item) {
    const title = window.prompt('Titulo da oportunidade', String(item.title || item.name || ''));
    if (!title?.trim()) return;
    const status = window.prompt('Status da oportunidade', String(item.status || 'Nova'));
    if (status === null) return;
    const opportunities = payload?.opportunities.map((current) => current.id === item.id
      ? { ...current, title: title.trim(), status: status.trim() || 'Nova' }
      : current) || [];
    await persist(opportunities, String(item.id));
  }

  const list = (key: 'opportunities' | 'quotes', title: string) => {
    const items = payload?.[key] || [];
    return <section className="group"><h2>{title}</h2>{items.map((item, index) => <article key={String(item.id || index)}>
      <strong>{String(item.name || item.title || item.nome || `${title} ${index + 1}`)}</strong>
      <span>{String(item.status || item.stage || item.etapa || 'Sem status informado')}</span>
      {key === 'opportunities' && <button type="button" onClick={() => editOpportunity(item)} disabled={saving}>Editar</button>}
    </article>)}{!error && !items.length && <p>Nenhum registro disponivel.</p>}</section>;
  };

  return <ModuleLayout eyebrow="COMERCIAL" title="Comercial" description="Oportunidades e orcamentos em migracao incremental.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createOpportunity}><input name="title" placeholder="Titulo da oportunidade" required /><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar oportunidade'}</button></form>
    {list('opportunities', 'Oportunidades')}{list('quotes', 'Orcamentos')}
    <style jsx>{`.group{padding:10px 0}.group h2{font:500 23px Georgia,serif}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.group span,.group>p{font-size:12px;color:var(--proelium-muted)}`}</style>
  </ModuleLayout>;
}
