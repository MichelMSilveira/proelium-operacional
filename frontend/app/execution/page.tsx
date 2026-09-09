'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Project = { id: string; code?: string; name: string; clientId?: string };
type ExecutionEntry = { id: string; projectId: string; kind: string; date: string; person: string; quantity: string; amount: number; description: string; financialEntryId: string };
type ExecutionPayload = { entries?: ExecutionEntry[]; revision?: number };
type ProjectsPayload = { projects?: Project[] };

const kinds = ['Mão de obra', 'Material de execução', 'Transporte e logística', 'Serviço terceirizado', 'Outros gastos'];

function emptyEntry(): ExecutionEntry {
  return { id: '', projectId: '', kind: 'Mão de obra', date: new Date().toISOString().slice(0, 10), person: '', quantity: '', amount: 0, description: '', financialEntryId: '' };
}

export default function ExecutionPage() {
  const [entries, setEntries] = useState<ExecutionEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<ExecutionEntry>(emptyEntry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [execution, projectPayload] = await Promise.all([apiGet<ExecutionPayload>('/api/execution'), apiGet<ProjectsPayload>('/api/projects')]);
      setEntries(execution.entries || []);
      setProjects(projectPayload.projects || []);
      setRevision(execution.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar execução.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = draft.id || `exec-${Date.now()}`;
      const entry = { ...draft, id, amount: Math.max(0, Number(draft.amount) || 0) };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/execution/${encodeURIComponent(id)}`, { entry, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/execution', { entry, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyEntry());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o lancamento de execucao.');
    } finally {
      setSaving(false);
    }
  }

  const total = useMemo(() => entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [entries]);
  const labor = useMemo(() => entries.filter((entry) => entry.kind === 'Mão de obra').reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [entries]);
  const materials = useMemo(() => entries.filter((entry) => entry.kind === 'Material de execução').reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [entries]);
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name || id || 'Projeto não informado';

  return <ModuleLayout eyebrow="EXECUÇÃO" title="Execução e mão de obra" description="Registre custos reais do campo por projeto; cada lançamento também alimenta o Financeiro.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar lançamento de execução' : 'Novo gasto de execução'}</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={save}>
        <select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} required><option value="">Selecione o projeto</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code || 'Projeto'} · {project.name}</option>)}</select>
        <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>{kinds.map((kind) => <option key={kind}>{kind}</option>)}</select>
        <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
        <input value={draft.person} onChange={(event) => setDraft({ ...draft, person: event.target.value })} placeholder="Colaborador / fornecedor" />
        <input type="number" min="0" step="0.5" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} placeholder="Horas / quantidade" />
        <input type="number" min="0" step="0.01" value={draft.amount || ''} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} placeholder="Valor (R$)" required />
        <textarea className="wide" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Descrição do gasto" required />
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar lançamento' : 'Registrar gasto'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyEntry())}>Cancelar</button>}</div>
      </form>
    </section>
    <div className="summary"><article className="card"><span>Gasto de execução</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></article><article className="card"><span>Mão de obra</span><strong>{labor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></article><article className="card"><span>Materiais</span><strong>{materials.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></article></div>
    <section className="group"><h2>Lançamentos de campo</h2>{entries.map((entry) => <article className="card" key={entry.id}><div className="section-head"><div><strong>{projectName(entry.projectId)}</strong><span>{entry.date || 'Sem data'} · {entry.kind} · {entry.person || 'Responsável não informado'}</span></div><strong>{Number(entry.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><span>{entry.description}{entry.quantity ? ` · Quantidade: ${entry.quantity}` : ''}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...entry })} disabled={saving}>Editar</button></div></article>)}{!error && !entries.length && <p>Nenhum gasto de execução disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid textarea{min-height:64px}.form-grid .wide{grid-column:span 3}.form-grid button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.group button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}.summary span,.group>p,.card>span,.section-head span{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:25px;color:var(--proelium-olive)}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head>strong{color:var(--proelium-olive)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}.form-grid .wide{grid-column:span 2}.summary{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.summary{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
