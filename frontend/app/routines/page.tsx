'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;
type RoutinesPayload = { routines?: Item[]; projectChecklists?: Item[] };

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Item[]>([]);
  const [checklists, setChecklists] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<RoutinesPayload>('/api/routines')
      .then((payload) => { setRoutines(payload.routines || []); setChecklists(payload.projectChecklists || []); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar rotinas.'));
  }, []);

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

  return <ModuleLayout eyebrow="PADRONIZACAO" title="Rotinas e checklists" description="Procedimentos operacionais disponiveis para consulta e manutencao.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createRoutine}><input name="name" placeholder="Nome da rotina" required /><input name="description" placeholder="Descricao" /><input name="periodicity" placeholder="Periodicidade" /><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar rotina'}</button></form>
    <div className="summary"><article><span>Rotinas</span><strong>{routines.length}</strong></article><article><span>Checklists</span><strong>{checklists.length}</strong></article></div>
    <div className="record-list">{routines.map((item, index) => <article key={String(item.id || index)}><div><strong>{String(item.name || item.title || `Rotina ${index + 1}`)}</strong><span>{String(item.periodicity || item.status || item.category || 'Procedimento')}</span></div><button type="button" onClick={() => editRoutine(item)} disabled={saving}>Editar</button><button type="button" className="delete" onClick={() => removeRoutine(item)} disabled={saving}>Excluir</button></article>)}{!error && !routines.length && <p>Nenhuma rotina disponivel.</p>}</div>
    <style jsx>{`.create-form{display:grid;grid-template-columns:2fr 2fr 1fr auto;gap:8px;margin:24px 0}.create-form input{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px}.create-form button,.record-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.create-form button:disabled,.record-list button:disabled{opacity:.6}.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.record-list{display:grid;gap:10px}.record-list article div{display:grid;gap:6px}.record-list .delete{background:transparent;color:#9d423b;border:1px solid #e6b9af}@media(max-width:800px){.create-form{grid-template-columns:1fr}.summary{grid-template-columns:1fr}}`}</style>
  </ModuleLayout>;
}
