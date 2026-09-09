'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;
type RoutinesPayload = { routines?: Item[]; projectChecklists?: Item[]; revision?: number };
const phases = ['Projeto técnico', 'Cabeamento', 'Instalação', 'Testes', 'Entrega'];

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Item[]>([]);
  const [checklists, setChecklists] = useState<Item[]>([]);
  const [revision, setRevision] = useState<number>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const payload = await apiGet<RoutinesPayload>('/api/routines');
      setRoutines(payload.routines || []);
      setChecklists(payload.projectChecklists || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar rotinas e checklists.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function createRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name || '').trim();
    if (!name) return;
    const routine = { id: `rot-next-${crypto.randomUUID()}`, name, description: String(values.description || '').trim(), periodicity: String(values.periodicity || 'Sem periodicidade') };
    setSaving(true); setError('');
    try {
      await apiPost('/api/routines', { routine });
      setRoutines((current) => [...current, routine]);
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar a rotina.');
    } finally { setSaving(false); }
  }

  async function editRoutine(routine: Item) {
    const name = window.prompt('Nome da rotina', String(routine.name || routine.title || ''));
    if (!name?.trim()) return;
    const periodicity = window.prompt('Periodicidade', String(routine.periodicity || 'Sem periodicidade'));
    if (periodicity === null) return;
    const updated = { ...routine, name: name.trim(), periodicity: periodicity.trim() || 'Sem periodicidade' };
    setSaving(true); setError('');
    try {
      await apiPatch(`/api/routines/${String(routine.id)}`, { routine: updated });
      setRoutines((current) => current.map((item) => item.id === routine.id ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel editar a rotina.');
    } finally { setSaving(false); }
  }

  async function removeRoutine(routine: Item) {
    if (!window.confirm(`Excluir a rotina ${String(routine.name || 'sem nome')}?`)) return;
    setSaving(true); setError('');
    try {
      await apiDelete(`/api/routines/${String(routine.id)}`, {});
      setRoutines((current) => current.filter((item) => item.id !== routine.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir a rotina.');
    } finally { setSaving(false); }
  }

  async function createChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const checklist = { id: `chk-${Date.now()}`, projectId: String(values.projectId || '').trim(), title: String(values.title || '').trim(), phase: String(values.phase || phases[0]), done: false, standard: false };
    if (!checklist.projectId || !checklist.title) return;
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/routines/checklists', { checklist, baseRevision: revision });
      setRevision(result.revision ?? revision);
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o checklist.');
    } finally { setSaving(false); }
  }

  async function updateChecklist(item: Item, changes: Item) {
    const id = String(item.id || '');
    if (!id) return;
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/routines/checklists/${encodeURIComponent(id)}`, { checklist: { ...item, ...changes, id }, baseRevision: revision });
      setRevision(result.revision ?? revision);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel atualizar o checklist.');
    } finally { setSaving(false); }
  }

  async function editChecklist(item: Item) {
    const title = window.prompt('Verificação do checklist', String(item.title || item.name || ''));
    if (!title?.trim()) return;
    const phase = window.prompt('Fase', String(item.phase || phases[0]));
    if (phase === null) return;
    await updateChecklist(item, { title: title.trim(), phase: phase.trim() || phases[0] });
  }

  return <ModuleLayout eyebrow="PADRONIZAÇÃO" title="Rotinas e checklists" description="Mantenha procedimentos e verificações de execução por projeto.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createRoutine}><input name="name" placeholder="Nome da rotina" required /><input name="description" placeholder="Descrição" /><input name="periodicity" placeholder="Periodicidade" /><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar rotina'}</button></form>
    <section className="card checklist-card"><div className="section-head"><h2>Novo item de checklist</h2><span>Revisão {revision ?? '—'}</span></div><form className="checklist-form" onSubmit={createChecklist}><input name="projectId" placeholder="ID do projeto" required /><input name="title" placeholder="Verificação" required /><select name="phase" defaultValue={phases[0]}>{phases.map((phase) => <option key={phase}>{phase}</option>)}</select><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar checklist'}</button></form></section>
    <div className="summary"><article><span>Rotinas</span><strong>{routines.length}</strong></article><article><span>Checklists</span><strong>{checklists.length}</strong></article></div>
    <div className="record-list">{routines.map((item, index) => <article key={String(item.id || index)}><div><strong>{String(item.name || item.title || `Rotina ${index + 1}`)}</strong><span>{String(item.periodicity || item.status || item.category || 'Procedimento')}</span></div><button type="button" onClick={() => editRoutine(item)} disabled={saving}>Editar</button><button type="button" className="delete" onClick={() => removeRoutine(item)} disabled={saving}>Excluir</button></article>)}{!error && !routines.length && <p>Nenhuma rotina disponível.</p>}</div>
    <section className="checklist-list"><h2>Checklists de projetos</h2>{checklists.map((item, index) => <article className="card" key={String(item.id || index)}><div><strong>{String(item.title || item.name || `Verificação ${index + 1}`)}</strong><span>{String(item.projectId || 'Projeto não informado')} · {String(item.phase || 'Projeto técnico')}</span></div><label><input type="checkbox" checked={Boolean(item.done)} onChange={() => void updateChecklist(item, { done: !Boolean(item.done) })} disabled={saving} /> Concluído</label><button type="button" className="secondary" onClick={() => void editChecklist(item)} disabled={saving}>Editar</button></article>)}{!error && !checklists.length && <p>Nenhum checklist disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.create-form,.checklist-form{display:grid;grid-template-columns:2fr 2fr 1fr auto;gap:8px;margin:24px 0}.checklist-card{margin-top:22px}.checklist-form{margin:0;grid-template-columns:1fr 2fr 1fr auto}.create-form input,.checklist-form input,.checklist-form select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.create-form button,.checklist-form button,.record-list button,.checklist-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.create-form button:disabled,.checklist-form button:disabled,.record-list button:disabled,.checklist-list button:disabled{opacity:.6}.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.record-list span,.record-list>p,.checklist-list span,.checklist-list>p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.record-list,.checklist-list{display:grid;gap:10px}.record-list article div,.checklist-list article div{display:grid;gap:6px}.record-list .delete{background:transparent;color:#9d423b;border:1px solid #e6b9af}.checklist-list h2{font:500 23px Georgia,serif;margin:20px 0 4px}.checklist-list article{grid-template-columns:1fr auto auto;align-items:center}.checklist-list .secondary{background:transparent;color:var(--proelium-olive);border:1px solid var(--proelium-line)}@media(max-width:800px){.create-form,.checklist-form{grid-template-columns:1fr}.summary{grid-template-columns:1fr}.checklist-list article{grid-template-columns:1fr}}`}</style>
  </ModuleLayout>;
}
