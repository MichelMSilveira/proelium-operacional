'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPost } from '../../lib/api';

type Evaluation = { id: string; projectId: string; source: string; evaluator: string; collaborator: string; installation: number; service: number; commitment: number; deadline: number; note: string; date: string };
type QualityPayload = { evaluations?: Evaluation[]; revision?: number };

function emptyEvaluation(): Evaluation {
  return { id: '', projectId: '', source: 'Interna', evaluator: '', collaborator: '', installation: 5, service: 5, commitment: 5, deadline: 5, note: '', date: new Date().toISOString().slice(0, 10) };
}

function evaluationScore(item: Evaluation) {
  return (item.installation + item.service + item.commitment + item.deadline) / 4;
}

export default function QualityPage() {
  const [items, setItems] = useState<Evaluation[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<Evaluation>(emptyEvaluation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<QualityPayload>('/api/quality');
      setItems(payload.evaluations || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar avaliacoes.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const evaluation = { ...draft, id: `eva-${Date.now()}` };
      const result = await apiPost<{ revision?: number }>('/api/quality', { evaluation, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyEvaluation());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel registrar a avaliacao.');
    } finally {
      setSaving(false);
    }
  }

  const average = useMemo(() => items.length ? (items.reduce((sum, item) => sum + evaluationScore(item), 0) / items.length).toFixed(1) : '—', [items]);

  return <ModuleLayout eyebrow="QUALIDADE" title="Avaliações" description="Registre percepções de clientes e equipe sobre a operação.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>Registrar avaliação</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={saveEvaluation}>
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <select aria-label="Origem da avaliação" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option>Interna</option><option>Cliente</option></select>
        <input value={draft.collaborator} onChange={(event) => setDraft({ ...draft, collaborator: event.target.value })} placeholder="Pessoa avaliada" required />
        <input value={draft.evaluator} onChange={(event) => setDraft({ ...draft, evaluator: event.target.value })} placeholder="Avaliador" required />
        <input aria-label="Data da avaliação" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
        <label>Instalação<input type="number" min="1" max="5" value={draft.installation} onChange={(event) => setDraft({ ...draft, installation: Number(event.target.value) })} required /></label>
        <label>Atendimento<input type="number" min="1" max="5" value={draft.service} onChange={(event) => setDraft({ ...draft, service: Number(event.target.value) })} required /></label>
        <label>Compromisso<input type="number" min="1" max="5" value={draft.commitment} onChange={(event) => setDraft({ ...draft, commitment: Number(event.target.value) })} required /></label>
        <label>Prazo<input type="number" min="1" max="5" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: Number(event.target.value) })} required /></label>
        <textarea className="wide" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Evidência, comentário ou melhoria" />
        <button disabled={saving}>{saving ? 'Salvando...' : 'Registrar avaliação'}</button>
      </form>
    </section>
    <div className="summary"><article className="card"><span>Avaliações</span><strong>{items.length}</strong></article><article className="card"><span>Média geral</span><strong>{average}</strong></article></div>
    <div className="record-list">{items.map((item) => <article className="card" key={item.id}><div className="section-head"><div><h2>{item.collaborator}</h2><span>{item.projectId} · {item.source} · {item.date || 'Sem data'}</span></div><strong>{evaluationScore(item).toFixed(1)}/5</strong></div><span>Avaliador: {item.evaluator} · Instalação {item.installation}/5 · Atendimento {item.service}/5 · Compromisso {item.commitment}/5 · Prazo {item.deadline}/5</span>{item.note && <p>{item.note}</p>}</article>)}{!error && !items.length && <p>Nenhuma avaliação disponível.</p>}</div>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid label{display:grid;gap:5px;font-size:12px;color:var(--proelium-muted)}.form-grid textarea.wide{grid-column:span 3;min-height:60px}.form-grid button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled{opacity:.6}.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary span,.record-list>p,.card>span,.section-head span{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head h2{margin:0}.section-head>strong{font-size:18px;color:var(--proelium-olive)}.record-list{display:grid;gap:12px}.record-list p{margin:0}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}.form-grid textarea.wide{grid-column:span 2}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-grid textarea.wide{grid-column:auto}.summary{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
