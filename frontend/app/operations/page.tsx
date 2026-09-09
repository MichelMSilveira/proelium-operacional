'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Task = { id: string; title: string; projectId: string; responsible: string; due: string; time: string; status: string; priority: string };
type ServiceOrder = Record<string, unknown>;
type TaskPayload = { tasks?: Task[]; revision?: number };
type OperationsPayload = { serviceOrders?: ServiceOrder[] };
const statuses = ['Aberta', 'Em andamento', 'Concluída', 'Bloqueada'];
const priorities = ['Baixa', 'Média', 'Alta', 'Urgente'];

function emptyTask(): Task {
  return { id: '', title: '', projectId: '', responsible: '', due: '', time: '', status: 'Aberta', priority: 'Média' };
}

export default function OperationsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<Task>(emptyTask);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [taskPayload, operationPayload] = await Promise.all([apiGet<TaskPayload>('/api/tasks'), apiGet<OperationsPayload>('/api/operations')]);
      setTasks(taskPayload.tasks || []);
      setRevision(taskPayload.revision);
      setServiceOrders(operationPayload.serviceOrders || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar operacao.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = draft.id || `tsk-${Date.now()}`;
      const task = { ...draft, id };
      const request = { task, baseRevision: revision };
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/tasks/${encodeURIComponent(id)}`, request)
        : await apiPost<{ revision?: number }>('/api/tasks', request);
      setRevision(result.revision ?? revision);
      setDraft(emptyTask());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Excluir a tarefa ${task.title}?`)) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiDelete<{ revision?: number }>(`/api/tasks/${encodeURIComponent(task.id)}`, {});
      setRevision(result.revision ?? revision);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="OPERACAO" title="Execucao operacional" description="Gerencie tarefas e consulte ordens de servico vinculadas ao atendimento.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{draft.id ? 'Editar tarefa' : 'Nova tarefa'}</h2><span>Revisao {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={saveTask}>
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Tarefa" required />
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} placeholder="Responsavel" />
        <input value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} placeholder="Prazo" />
        <input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} placeholder="Horario" />
        <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        <div><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar tarefa' : 'Adicionar tarefa'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyTask())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="group"><h2>Tarefas</h2>{tasks.map((task) => <article className="card" key={task.id}><div className="section-head"><div><strong>{task.title}</strong><span>{task.projectId} · {task.responsible || 'Responsavel nao informado'} · {task.due || 'Sem prazo'}</span></div><strong>{task.status}</strong></div><span>Prioridade: {task.priority}{task.time ? ` · ${task.time}` : ''}</span><div><button type="button" className="secondary" onClick={() => setDraft({ ...task })} disabled={saving}>Editar</button><button type="button" className="danger" onClick={() => void removeTask(task)} disabled={saving}>Excluir</button></div></article>)}{!error && !tasks.length && <p>Nenhuma tarefa disponivel.</p>}</section>
    <section className="group"><h2>Ordens de servico</h2>{serviceOrders.map((order, index) => <article className="card" key={String(order.id || index)}><strong>{String(order.code || order.title || order.name || `Ordem ${index + 1}`)}</strong><span>{String(order.description || order.type || 'Escopo nao informado')} · {String(order.status || order.stage || 'Sem status informado')}</span></article>)}{!error && !serviceOrders.length && <p>Nenhuma ordem de servico disponivel.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.group button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important;margin-left:6px}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head span{display:block;font-size:12px;color:var(--proelium-muted)}.section-head>strong{color:var(--proelium-olive)}.group>p,.card>span{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
