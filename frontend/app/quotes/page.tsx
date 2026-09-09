'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;
type Payload = { revision?: number; clients: Item[]; quotes: Item[] };
type QuotesPayload = { quotes?: Item[]; revision?: number };
type ClientsPayload = { clients?: Item[] };

export default function QuotesPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiGet<QuotesPayload>('/api/quotes'), apiGet<ClientsPayload>('/api/clients')])
      .then(([quotes, clients]) => setPayload({
        revision: quotes.revision,
        quotes: quotes.quotes || [],
        clients: clients.clients || [],
      }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar orcamentos.'));
  }, []);

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const title = String(values.title || '').trim();
    if (!title) return;
    const quote = {
      id: `orc-next-${crypto.randomUUID()}`,
      title,
      clientId: String(values.clientId || ''),
      validUntil: String(values.validUntil || ''),
      status: 'Rascunho',
      value: 0,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/quotes', { quote, baseRevision: payload.revision || 0 });
      setPayload({ ...payload, revision: result.revision, quotes: [...payload.quotes, quote] });
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o orcamento.');
    } finally { setSaving(false); }
  }

  const clients = payload?.clients || [];
  const quotes = payload?.quotes || [];
  return <ModuleLayout eyebrow="COMERCIAL" title="Orcamentos" description="Criacao de rascunhos preservando cliente, validade e versao.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createQuote}>
      <input name="title" placeholder="Nome da proposta / orcamento" required />
      <select name="clientId" defaultValue=""><option value="">Cliente (opcional)</option>{clients.map((client, index) => <option key={String(client.id || index)} value={String(client.id || '')}>{String(client.name || client.nome || 'Cliente')}</option>)}</select>
      <input name="validUntil" type="date" />
      <button disabled={saving}>{saving ? 'Salvando...' : 'Criar rascunho'}</button>
    </form>
    <div className="record-list">{quotes.map((quote, index) => <article key={String(quote.id || index)}>
      <a href={`/quotes/${String(quote.id)}`}><strong>{String(quote.title || quote.name || `Orcamento ${index + 1}`)}</strong></a>
      <span>{String(quote.status || 'Rascunho')} · v{String(quote.version || 1)}</span>
    </article>)}{!error && quotes.length === 0 && <p>Nenhum orcamento disponivel.</p>}</div>
  </ModuleLayout>;
}
