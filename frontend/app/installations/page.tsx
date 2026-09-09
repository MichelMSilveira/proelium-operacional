'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Installation = { id: string; clientId: string; projectId: string; type: string; site: string; lead: string; stage: string; progress: number; due: string; status: string };
type InstallationsPayload = { installations?: Installation[]; revision?: number };
const stages = ['Projeto técnico', 'Planejamento', 'Preparação', 'Execução', 'Comissionamento', 'Concluída'];
const statuses = ['Planejamento', 'Em execução', 'Concluída', 'Bloqueada', 'Cancelada'];

function emptyInstallation(): Installation {
  return { id: '', clientId: '', projectId: '', type: 'Instalação', site: '', lead: '', stage: 'Projeto técnico', progress: 0, due: '', status: 'Planejamento' };
}

export default function InstallationsPage() {
  const [items, setItems] = useState<Installation[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<Installation>(emptyInstallation);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<InstallationsPayload>('/api/installations');
      setItems(payload.installations || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar instalações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = draft.id || `ins-${Date.now()}`;
      const installation = { ...draft, id, progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)) };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/installations/${encodeURIComponent(id)}`, { installation, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/installations', { installation, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyInstallation());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a instalação.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="CAMPO" title="Instalações" description="Acompanhe e atualize instalações vinculadas a clientes e projetos.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar instalação' : 'Nova instalação'}</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={save}>
        <input value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} placeholder="ID do cliente" required />
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} placeholder="Tipo da instalação" required />
        <input value={draft.site} onChange={(event) => setDraft({ ...draft, site: event.target.value })} placeholder="Local / unidade" required />
        <input value={draft.lead} onChange={(event) => setDraft({ ...draft, lead: event.target.value })} placeholder="Responsável técnico" required />
        <select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
        <input type="number" min="0" max="100" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} placeholder="Progresso (%)" />
        <input value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} placeholder="Prazo" />
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar instalação' : 'Adicionar instalação'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyInstallation())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="group"><h2>Instalações cadastradas</h2>{loading && <p>Carregando instalações…</p>}{!loading && items.map((item) => <article className="card" key={item.id}><div className="section-head"><div><strong>{item.type}</strong><span>{item.clientId} · {item.projectId} · {item.site}</span></div><strong>{item.status}</strong></div><span>{item.lead} · {item.stage} · {item.progress}% · {item.due || 'Sem prazo'}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...item })} disabled={saving}>Editar</button></div></article>)}{!loading && !error && !items.length && <p>Nenhuma instalação disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.group button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important;margin-left:6px}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head span{display:block;font-size:12px;color:var(--proelium-muted)}.section-head>strong{color:var(--proelium-olive)}.group>p,.card>span{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
