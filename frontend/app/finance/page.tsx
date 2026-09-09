'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type FinanceEntry = {
  id: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  responsible: string;
  clientId: string;
  projectId: string;
  accountId: string;
};

type FinancePayload = { entries?: FinanceEntry[]; revision?: number };
type FinanceDraft = FinanceEntry;

function emptyEntry(): FinanceDraft {
  return { id: '', type: 'Despesa', status: 'Realizado', amount: 0, date: new Date().toISOString().slice(0, 10), category: '', description: '', responsible: '', clientId: '', projectId: '', accountId: '' };
}

export default function FinancePage() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<FinanceDraft>(emptyEntry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<FinancePayload>('/api/finance');
      setEntries(payload.entries || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar financeiro.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = draft.id || `fin-${Date.now()}`;
      const entry = { ...draft, id, amount: Math.max(0, Number(draft.amount) || 0) };
      const request = { entry, baseRevision: revision };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/finance/${encodeURIComponent(id)}`, request)
        : await apiPost<{ revision?: number }>('/api/finance', request);
      setRevision(result.revision ?? revision);
      setDraft(emptyEntry());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o lancamento.');
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entry: FinanceEntry) {
    if (!window.confirm(`Excluir o lancamento ${entry.description}?`)) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiDelete<{ revision?: number }>(`/api/finance/${encodeURIComponent(entry.id)}`, {});
      setRevision(result.revision ?? revision);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir o lancamento.');
    } finally {
      setSaving(false);
    }
  }

  const total = useMemo(() => entries.reduce((sum, item) => sum + Number(item.amount || 0), 0), [entries]);

  return <ModuleLayout eyebrow="FINANCEIRO" title="Financeiro" description="Registre receitas e despesas com controle de revisao e responsaveis.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar lancamento' : 'Novo lancamento'}</h2><span>Revisao {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={saveEntry}>
        <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option>Despesa</option><option>Receita</option></select>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Realizado</option><option>Recebido</option><option>Pago</option><option>Pendente</option></select>
        <input type="number" min="0.01" step="0.01" value={draft.amount || ''} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} placeholder="Valor" required />
        <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Categoria" />
        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Descricao" required />
        <input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} placeholder="Responsavel" />
        <input value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} placeholder="ID do cliente (opcional)" />
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto (opcional)" />
        <input value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })} placeholder="ID da conta (opcional)" />
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar lancamento' : 'Adicionar lancamento'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyEntry())}>Cancelar</button>}</div>
      </form>
    </section>
    <div className="total"><span>Total dos lancamentos</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    <div className="record-list">
      {entries.map((entry) => <article className="card" key={entry.id}><div className="section-head"><div><h2>{entry.description}</h2><span>{entry.type} · {entry.status} · {entry.date || 'Sem data'} · {entry.category || 'Sem categoria'}</span></div><strong>{entry.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><span>{entry.responsible || 'Responsavel nao informado'}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...entry })} disabled={saving}>Editar</button><button type="button" className="danger" onClick={() => void removeEntry(entry)} disabled={saving}>Excluir</button></div></article>)}
      {!error && entries.length === 0 && <p>Nenhum lancamento disponivel.</p>}
    </div>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid button,.record-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.record-list button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important;margin-left:6px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head h2{margin:0}.section-head span,.record-list>p,.card>span{font-size:12px;color:var(--proelium-muted)}.section-head>strong{font-size:18px;color:var(--proelium-olive)}.total{display:flex;justify-content:space-between;align-items:center;margin:28px 0;padding:20px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.total span{font-size:12px;color:var(--proelium-muted)}.total strong{font-size:24px;color:var(--proelium-olive)}.record-list{display:grid;gap:12px}.record-list>p{padding:12px}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
