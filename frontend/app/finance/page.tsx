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

type FinanceAccount = { id: string; name: string; institution: string; type: string; initialBalance: number; status: string; notes: string };
type FinancePayload = { entries?: FinanceEntry[]; accounts?: FinanceAccount[]; revision?: number };
type FinanceDraft = FinanceEntry;

function emptyEntry(): FinanceDraft {
  return { id: '', type: 'Despesa', status: 'Realizado', amount: 0, date: new Date().toISOString().slice(0, 10), category: '', description: '', responsible: '', clientId: '', projectId: '', accountId: '' };
}

function emptyAccount(): FinanceAccount {
  return { id: '', name: '', institution: '', type: 'Corrente', initialBalance: 0, status: 'Ativa', notes: '' };
}

export default function FinancePage() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<FinanceDraft>(emptyEntry);
  const [accountDraft, setAccountDraft] = useState<FinanceAccount>(emptyAccount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<FinancePayload>('/api/finance');
      setEntries(payload.entries || []);
      setAccounts(payload.accounts || []);
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

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = accountDraft.id || `acc-${Date.now()}`;
      const account = { ...accountDraft, id, initialBalance: Number(accountDraft.initialBalance) || 0 };
      const result = accountDraft.id
        ? await apiPatch<{ revision?: number }>(`/api/finance/accounts/${encodeURIComponent(id)}`, { account, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/finance/accounts', { account, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setAccountDraft(emptyAccount());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar a conta financeira.');
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
        <select aria-label="Tipo do lançamento" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option>Despesa</option><option>Receita</option></select>
        <select aria-label="Status do lançamento" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Realizado</option><option>Recebido</option><option>Pago</option><option>Pendente</option></select>
        <input type="number" min="0.01" step="0.01" value={draft.amount || ''} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} placeholder="Valor" required />
        <input aria-label="Data do lançamento" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Categoria" />
        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Descricao" required />
        <input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} placeholder="Responsavel" />
        <input value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} placeholder="ID do cliente (opcional)" />
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto (opcional)" />
        <select aria-label="Conta financeira" value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}><option value="">Sem conta vinculada</option>{accounts.filter((account) => account.status !== 'Inativa').map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar lancamento' : 'Adicionar lancamento'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyEntry())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="card">
      <div className="section-head"><h2>{accountDraft.id ? 'Editar conta financeira' : 'Nova conta financeira'}</h2><span>Contas disponíveis para vincular lançamentos</span></div>
      <form className="form-grid" onSubmit={saveAccount}>
        <input value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} placeholder="Nome da conta" required />
        <input value={accountDraft.institution} onChange={(event) => setAccountDraft({ ...accountDraft, institution: event.target.value })} placeholder="Instituição" />
        <select aria-label="Tipo da conta" value={accountDraft.type} onChange={(event) => setAccountDraft({ ...accountDraft, type: event.target.value })}><option>Corrente</option><option>Poupança</option><option>Carteira digital</option></select>
        <input type="number" step="0.01" value={accountDraft.initialBalance} onChange={(event) => setAccountDraft({ ...accountDraft, initialBalance: Number(event.target.value) })} placeholder="Saldo inicial" />
        <select aria-label="Status da conta" value={accountDraft.status} onChange={(event) => setAccountDraft({ ...accountDraft, status: event.target.value })}><option>Ativa</option><option>Inativa</option></select>
        <textarea className="wide" value={accountDraft.notes} onChange={(event) => setAccountDraft({ ...accountDraft, notes: event.target.value })} placeholder="Observações" />
        <div><button disabled={saving}>{saving ? 'Salvando...' : accountDraft.id ? 'Salvar conta' : 'Cadastrar conta'}</button>{accountDraft.id && <button type="button" className="secondary" onClick={() => setAccountDraft(emptyAccount())}>Cancelar</button>}</div>
      </form>
      <div className="record-list">{accounts.map((account) => { const movement = entries.filter((entry) => entry.accountId === account.id).reduce((sum, entry) => sum + (entry.type === 'Receita' ? 1 : -1) * Number(entry.amount || 0), 0); return <article className="card" key={account.id}><div className="section-head"><div><strong>{account.name}</strong><span>{account.institution || 'Instituição não informada'} · {account.type}</span></div><strong>{(Number(account.initialBalance || 0) + movement).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><span>{account.status} · Saldo projetado</span><div><button type="button" className="secondary" onClick={() => setAccountDraft({ ...account })} disabled={saving}>Editar</button></div></article>})}{!accounts.length && <p>Nenhuma conta financeira cadastrada.</p>}</div>
    </section>
    <div className="total"><span>Total dos lancamentos</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    <div className="record-list">
      {entries.map((entry) => <article className="card" key={entry.id}><div className="section-head"><div><h2>{entry.description}</h2><span>{entry.type} · {entry.status} · {entry.date || 'Sem data'} · {entry.category || 'Sem categoria'}</span></div><strong>{entry.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><span>{entry.responsible || 'Responsavel nao informado'}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...entry })} disabled={saving}>Editar</button><button type="button" className="danger" onClick={() => void removeEntry(entry)} disabled={saving}>Excluir</button></div></article>)}
      {!error && entries.length === 0 && <p>Nenhum lancamento disponivel.</p>}
    </div>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid textarea{min-height:64px}.form-grid .wide{grid-column:span 2}.form-grid button,.record-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.record-list button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important;margin-left:6px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head h2{margin:0}.section-head span,.record-list>p,.card>span{font-size:12px;color:var(--proelium-muted)}.section-head>strong{font-size:18px;color:var(--proelium-olive)}.total{display:flex;justify-content:space-between;align-items:center;margin:28px 0;padding:20px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.total span{font-size:12px;color:var(--proelium-muted)}.total strong{font-size:24px;color:var(--proelium-olive)}.record-list{display:grid;gap:12px}.record-list>p{padding:12px}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}.form-grid .wide{grid-column:span 2}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
