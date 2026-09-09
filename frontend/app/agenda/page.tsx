'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Appointment = { id: string; title: string; clientId: string; projectId: string; assignee: string; date: string; time: string; note: string; status: string };
type AgendaPayload = { appointments?: Appointment[]; revision?: number };
const statuses = ['Agendado', 'Confirmado', 'Concluído', 'Cancelado'];

function emptyAppointment(): Appointment {
  return { id: '', title: '', clientId: '', projectId: '', assignee: '', date: new Date().toISOString().slice(0, 10), time: '', note: '', status: 'Agendado' };
}

export default function AgendaPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<Appointment>(emptyAppointment);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<AgendaPayload>('/api/agenda');
      setItems(payload.appointments || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar agenda.');
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
      const id = draft.id || `apt-${Date.now()}`;
      const appointment = { ...draft, id };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/agenda/${encodeURIComponent(id)}`, { appointment, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/agenda', { appointment, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyAppointment());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o compromisso.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Appointment) {
    if (!window.confirm(`Excluir o compromisso ${item.title}?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/api/agenda/${encodeURIComponent(item.id)}`, {});
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o compromisso.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="PLANEJAMENTO" title="Agenda" description="Crie e acompanhe compromissos vinculados à operação.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar compromisso' : 'Novo compromisso'}</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={save}>
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Compromisso" required />
        <input value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} placeholder="Responsável" required />
        <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
        <input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
        <input value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} placeholder="ID do cliente (opcional)" />
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto (opcional)" />
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        <textarea className="wide" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Observação" />
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar compromisso' : 'Adicionar compromisso'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyAppointment())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="group"><h2>Compromissos cadastrados</h2>{loading && <p>Carregando agenda…</p>}{!loading && items.map((item) => <article className="card" key={item.id}><div className="section-head"><div><strong>{item.title}</strong><span>{item.date || 'Sem data'}{item.time ? ` · ${item.time}` : ''} · {item.assignee}</span></div><strong>{item.status}</strong></div><span>{item.clientId || 'Sem cliente'} · {item.projectId || 'Sem projeto'}{item.note ? ` · ${item.note}` : ''}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...item })} disabled={saving}>Editar</button><button type="button" className="danger" onClick={() => void remove(item)} disabled={saving}>Excluir</button></div></article>)}{!loading && !error && !items.length && <p>Nenhum compromisso disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid textarea.wide{grid-column:span 3;min-height:64px}.form-grid button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.group button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important;margin-left:6px}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head span{display:block;font-size:12px;color:var(--proelium-muted)}.section-head>strong{color:var(--proelium-olive)}.group>p,.card>span{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}.form-grid textarea.wide{grid-column:span 2}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-grid textarea.wide{grid-column:auto}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
