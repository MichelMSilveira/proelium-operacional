'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Collaborator = { id: string; name: string; role: string; specialty: string; relationship: string; availability: string; compensation: string; status: string };
type CollaboratorsPayload = { collaborators?: Collaborator[]; revision?: number };
const statuses = ['Ativo', 'Inativo'];

function emptyCollaborator(): Collaborator {
  return { id: '', name: '', role: '', specialty: '', relationship: '', availability: '', compensation: '', status: 'Ativo' };
}

export default function CollaboratorsPage() {
  const [items, setItems] = useState<Collaborator[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<Collaborator>(emptyCollaborator);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<CollaboratorsPayload>('/api/collaborators');
      setItems(payload.collaborators || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar colaboradores.');
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
      const id = draft.id || `col-${Date.now()}`;
      const collaborator = { ...draft, id };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/collaborators/${encodeURIComponent(id)}`, { collaborator, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/collaborators', { collaborator, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyCollaborator());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o colaborador.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="PESSOAS" title="Colaboradores e parceiros" description="Cadastre e atualize a equipe disponível para a operação.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar colaborador' : 'Novo colaborador'}</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={save}>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome completo" required />
        <input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="Função principal" required />
        <input value={draft.specialty} onChange={(event) => setDraft({ ...draft, specialty: event.target.value })} placeholder="Especialidade" />
        <input value={draft.relationship} onChange={(event) => setDraft({ ...draft, relationship: event.target.value })} placeholder="Forma de atuação / parceria" />
        <input value={draft.availability} onChange={(event) => setDraft({ ...draft, availability: event.target.value })} placeholder="Disponibilidade" />
        <input value={draft.compensation} onChange={(event) => setDraft({ ...draft, compensation: event.target.value })} placeholder="Remuneração / acordo" />
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar colaborador' : 'Adicionar colaborador'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyCollaborator())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="group"><h2>Equipe cadastrada</h2>{loading && <p>Carregando colaboradores…</p>}{!loading && items.map((item) => <article className="card" key={item.id}><div className="section-head"><div><strong>{item.name}</strong><span>{item.role} · {item.specialty || 'Especialidade não informada'}</span></div><strong>{item.status}</strong></div><span>{item.relationship || 'Vínculo não informado'} · {item.availability || 'Disponibilidade não informada'}{item.compensation ? ` · ${item.compensation}` : ''}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...item })} disabled={saving}>Editar</button></div></article>)}{!loading && !error && !items.length && <p>Nenhum colaborador disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.group button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important;margin-left:6px}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head span{display:block;font-size:12px;color:var(--proelium-muted)}.section-head>strong{color:var(--proelium-olive)}.group>p,.card>span{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
