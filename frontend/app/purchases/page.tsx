'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type PurchaseItem = {
  id: string;
  projectId: string;
  sourceKey: string;
  room: string;
  productId: string;
  name: string;
  qty: number;
  unit: string;
  status: string;
  supplier: string;
  note: string;
};

type PurchasesPayload = { purchases?: PurchaseItem[]; revision?: number };
const statuses = ['Planejado', 'A cotar', 'Comprado', 'Recebido', 'Conferido'];

function emptyItem(): PurchaseItem {
  return { id: '', projectId: '', sourceKey: '', room: '', productId: '', name: '', qty: 1, unit: 'un', status: 'Planejado', supplier: '', note: '' };
}

export default function PurchasesPage() {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<PurchaseItem>(emptyItem);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<PurchasesPayload>('/api/purchases');
      setItems(payload.purchases || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar compras.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = draft.id || `buy-${Date.now()}`;
      const purchase = { ...draft, id, qty: Math.max(0, Number(draft.qty) || 0) };
      const request = { purchase, baseRevision: revision };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/purchases/${encodeURIComponent(id)}`, request)
        : await apiPost<{ revision?: number }>('/api/purchases', request);
      setRevision(result.revision ?? revision);
      setDraft(emptyItem());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o item de compra.');
    } finally {
      setSaving(false);
    }
  }

  async function advance(item: PurchaseItem) {
    const nextStatus = statuses[Math.min(statuses.length - 1, Math.max(0, statuses.indexOf(item.status) + 1))];
    if (nextStatus === item.status) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/purchases/${encodeURIComponent(item.id)}`, { purchase: { ...item, status: nextStatus }, baseRevision: revision });
      setRevision(result.revision ?? revision);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel avancar o status.');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(item: PurchaseItem) {
    if (!window.confirm(`Excluir o item ${item.name}?`)) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiDelete<{ revision?: number }>(`/api/purchases/${encodeURIComponent(item.id)}`, {});
      setRevision(result.revision ?? revision);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir o item.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="COMPRAS" title="Materiais e compras" description="Controle itens de obra, fornecedores, recebimento e conferência.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar item' : 'Novo item'}</h2><span>Revisao {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={saveItem}>
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Material / item" required />
        <input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Ambiente / frente" />
        <input type="number" min="0.01" step="0.01" value={draft.qty || ''} onChange={(event) => setDraft({ ...draft, qty: Number(event.target.value) })} placeholder="Quantidade" required />
        <select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}><option>un</option><option>m</option><option>kit</option><option>cx</option><option>h</option></select>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        <input value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} placeholder="Fornecedor" />
        <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Observacao" />
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar item' : 'Adicionar item'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyItem())}>Cancelar</button>}</div>
      </form>
    </section>
    <div className="record-list">
      {items.map((item) => <article className="card" key={item.id}><div className="section-head"><div><h2>{item.name}</h2><span>{item.projectId} · {item.room || 'Frente nao informada'} · {item.qty} {item.unit}</span></div><strong>{item.status}</strong></div><span>{item.supplier || 'Fornecedor a definir'} · {item.note || 'Sem observacao'}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...item })} disabled={saving}>Editar</button><button type="button" onClick={() => void advance(item)} disabled={saving || item.status === statuses[statuses.length - 1]}>Avancar</button><button type="button" className="danger" onClick={() => void removeItem(item)} disabled={saving}>Excluir</button></div></article>)}
      {!error && !items.length && <p>Nenhum item de compra disponivel.</p>}
    </div>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid button,.record-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.record-list button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important;margin-left:6px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head h2{margin:0}.section-head span,.record-list>p,.card>span{font-size:12px;color:var(--proelium-muted)}.section-head>strong{font-size:15px;color:var(--proelium-olive)}.record-list{display:grid;gap:12px;margin-top:28px}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
