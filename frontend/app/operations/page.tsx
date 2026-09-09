'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Task = { id: string; title: string; projectId: string; responsible: string; due: string; time: string; status: string; priority: string };
type ServiceOrder = { id: string; code: string; clientId: string; projectId: string; equipmentId: string; type: string; date: string; time: string; assignee: string; status: string; description: string };
type TaskPayload = { tasks?: Task[]; revision?: number };
type OperationsPayload = { serviceOrders?: ServiceOrder[]; revision?: number };
const taskStatuses = ['Aberta', 'Em andamento', 'Concluída', 'Bloqueada'];
const priorities = ['Baixa', 'Média', 'Alta', 'Urgente'];
const orderTypes = ['Visita técnica', 'Instalação', 'Manutenção', 'Chamado', 'Troca', 'Retirada'];
const orderStatuses = ['Agendada', 'Em execução', 'Concluída', 'Cancelada'];

function emptyTask(): Task {
  return { id: '', title: '', projectId: '', responsible: '', due: '', time: '', status: 'Aberta', priority: 'Média' };
}

function emptyOrder(): ServiceOrder {
  return { id: '', code: '', clientId: '', projectId: '', equipmentId: '', type: 'Visita técnica', date: new Date().toISOString().slice(0, 10), time: '', assignee: '', status: 'Agendada', description: '' };
}

export default function OperationsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [revision, setRevision] = useState<number>();
  const [taskDraft, setTaskDraft] = useState<Task>(emptyTask);
  const [orderDraft, setOrderDraft] = useState<ServiceOrder>(emptyOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [taskPayload, operationPayload] = await Promise.all([apiGet<TaskPayload>('/api/tasks'), apiGet<OperationsPayload>('/api/operations')]);
      setTasks(taskPayload.tasks || []);
      setServiceOrders(operationPayload.serviceOrders || []);
      setRevision(taskPayload.revision ?? operationPayload.revision);
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
      const id = taskDraft.id || `tsk-${Date.now()}`;
      const result = taskDraft.id
        ? await apiPatch<{ revision?: number }>(`/api/tasks/${encodeURIComponent(id)}`, { task: { ...taskDraft, id }, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/tasks', { task: { ...taskDraft, id }, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setTaskDraft(emptyTask());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = orderDraft.id || `os-${Date.now()}`;
      const result = orderDraft.id
        ? await apiPatch<{ revision?: number }>(`/api/operations/${encodeURIComponent(id)}`, { serviceOrder: { ...orderDraft, id }, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/operations', { serviceOrder: { ...orderDraft, id }, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setOrderDraft(emptyOrder());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar a ordem de servico.');
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Excluir a tarefa ${task.title}?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/api/tasks/${encodeURIComponent(task.id)}`, {});
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(order: ServiceOrder) {
    if (!window.confirm(`Excluir a ordem ${order.code || order.description}?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/api/operations/${encodeURIComponent(order.id)}`, {});
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir a ordem de servico.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="OPERAÇÃO" title="Execução operacional" description="Gerencie tarefas e ordens de serviço vinculadas ao atendimento.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>{taskDraft.id ? 'Editar tarefa' : 'Nova tarefa'}</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={saveTask}>
        <input value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="Tarefa" required />
        <input value={taskDraft.projectId} onChange={(event) => setTaskDraft({ ...taskDraft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <input value={taskDraft.responsible} onChange={(event) => setTaskDraft({ ...taskDraft, responsible: event.target.value })} placeholder="Responsável" />
        <input value={taskDraft.due} onChange={(event) => setTaskDraft({ ...taskDraft, due: event.target.value })} placeholder="Prazo" />
        <input value={taskDraft.time} onChange={(event) => setTaskDraft({ ...taskDraft, time: event.target.value })} placeholder="Horário" />
        <select value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
        <select value={taskDraft.status} onChange={(event) => setTaskDraft({ ...taskDraft, status: event.target.value })}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select>
        <div><button disabled={saving}>{saving ? 'Salvando...' : taskDraft.id ? 'Salvar tarefa' : 'Adicionar tarefa'}</button>{taskDraft.id && <button type="button" className="secondary" onClick={() => setTaskDraft(emptyTask())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="card">
      <div className="section-head"><h2>{orderDraft.id ? 'Editar ordem de serviço' : 'Nova ordem de serviço'}</h2><span>Cliente e descrição são obrigatórios</span></div>
      <form className="form-grid" onSubmit={saveOrder}>
        <input value={orderDraft.clientId} onChange={(event) => setOrderDraft({ ...orderDraft, clientId: event.target.value })} placeholder="ID do cliente" required />
        <input value={orderDraft.projectId} onChange={(event) => setOrderDraft({ ...orderDraft, projectId: event.target.value })} placeholder="ID do projeto (opcional)" />
        <input value={orderDraft.equipmentId} onChange={(event) => setOrderDraft({ ...orderDraft, equipmentId: event.target.value })} placeholder="ID do equipamento (opcional)" />
        <select value={orderDraft.type} onChange={(event) => setOrderDraft({ ...orderDraft, type: event.target.value })}>{orderTypes.map((type) => <option key={type}>{type}</option>)}</select>
        <input type="date" value={orderDraft.date} onChange={(event) => setOrderDraft({ ...orderDraft, date: event.target.value })} required />
        <input type="time" value={orderDraft.time} onChange={(event) => setOrderDraft({ ...orderDraft, time: event.target.value })} />
        <input value={orderDraft.assignee} onChange={(event) => setOrderDraft({ ...orderDraft, assignee: event.target.value })} placeholder="Responsável" required />
        <select value={orderDraft.status} onChange={(event) => setOrderDraft({ ...orderDraft, status: event.target.value })}>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select>
        <textarea className="wide" value={orderDraft.description} onChange={(event) => setOrderDraft({ ...orderDraft, description: event.target.value })} placeholder="Descrição / escopo" required />
        <div><button disabled={saving}>{saving ? 'Salvando...' : orderDraft.id ? 'Salvar ordem' : 'Agendar ordem'}</button>{orderDraft.id && <button type="button" className="secondary" onClick={() => setOrderDraft(emptyOrder())}>Cancelar</button>}</div>
      </form>
    </section>
    <section className="group"><h2>Tarefas</h2>{tasks.map((task) => <article className="card" key={task.id}><div className="section-head"><div><strong>{task.title}</strong><span>{task.projectId} · {task.responsible || 'Responsável não informado'} · {task.due || 'Sem prazo'}</span></div><strong>{task.status}</strong></div><span>Prioridade: {task.priority}{task.time ? ` · ${task.time}` : ''}</span><div><button type="button" className="secondary" onClick={() => setTaskDraft({ ...task })} disabled={saving}>Editar</button><button type="button" className="danger" onClick={() => void removeTask(task)} disabled={saving}>Excluir</button></div></article>)}{!error && !tasks.length && <p>Nenhuma tarefa disponível.</p>}</section>
    <section className="group"><h2>Ordens de serviço</h2>{serviceOrders.map((order) => <article className="card" key={order.id}><div className="section-head"><div><strong>{order.code || 'Ordem de serviço'}</strong><span>{order.type} · {order.clientId} · {order.date || 'Sem data'} · {order.assignee || 'Responsável não informado'}</span></div><strong>{order.status}</strong></div><span>{order.description}</span><div><button type="button" className="secondary" onClick={() => setOrderDraft({ ...order })} disabled={saving}>Editar</button><button type="button" className="danger" onClick={() => void removeOrder(order)} disabled={saving}>Excluir</button></div></article>)}{!error && !serviceOrders.length && <p>Nenhuma ordem de serviço disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid textarea.wide{grid-column:span 3;min-height:64px}.form-grid button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.group button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important;margin-left:6px}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head span{display:block;font-size:12px;color:var(--proelium-muted)}.section-head>strong{color:var(--proelium-olive)}.group>p,.card>span{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}.form-grid textarea.wide{grid-column:span 2}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-grid textarea.wide{grid-column:auto}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
