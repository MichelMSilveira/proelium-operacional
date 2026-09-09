'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPost } from '../../lib/api';

type ServiceReport = { id: string; projectId: string; serviceOrderId: string; appointmentId: string; technician: string; date: string; status: string; execution: string; tests: string; pending: string; nextActionDate: string; media: string };
type ProjectDelivery = { id: string; projectId: string; status: string; date: string; responsible: string; acceptance: string; note: string };
type ReportsPayload = { serviceReports?: ServiceReport[]; projectDeliveries?: ProjectDelivery[]; revision?: number };
const statuses = ['Concluído', 'Parcial', 'Pendente'];

function emptyReport(): ServiceReport {
  return { id: '', projectId: '', serviceOrderId: '', appointmentId: '', technician: '', date: new Date().toISOString().slice(0, 10), status: 'Concluído', execution: '', tests: '', pending: '', nextActionDate: '', media: '[]' };
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [deliveries, setDeliveries] = useState<ProjectDelivery[]>([]);
  const [revision, setRevision] = useState<number>();
  const [draft, setDraft] = useState<ServiceReport>(emptyReport);
  const [deliveryDraft, setDeliveryDraft] = useState<ProjectDelivery>({ id: '', projectId: '', status: 'Aguardando aceite', date: new Date().toISOString().slice(0, 10), responsible: '', acceptance: 'Aceite confirmado', note: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<ReportsPayload>('/api/reports');
      setReports(payload.serviceReports || []);
      setDeliveries(payload.projectDeliveries || []);
      setRevision(payload.revision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar relatórios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const delivery = { ...deliveryDraft, id: `del-${Date.now()}`, status: deliveryDraft.acceptance };
      const result = await apiPost<{ revision?: number }>('/api/reports/deliveries', { projectDelivery: delivery, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDeliveryDraft({ id: '', projectId: '', status: 'Aguardando aceite', date: new Date().toISOString().slice(0, 10), responsible: '', acceptance: 'Aceite confirmado', note: '' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel registrar a entrega.');
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const report = { ...draft, id: `rpt-${Date.now()}` };
      const result = await apiPost<{ revision?: number }>('/api/reports', { serviceReport: report, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyReport());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o relatório.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="RELATÓRIOS" title="Entregas e execução" description="Registre serviços executados e acompanhe o histórico técnico por projeto.">
    {error && <p className="error">{error}</p>}
    <section className="card">
      <div className="section-head"><h2>Emitir relatório de serviço</h2><span>Revisão {revision ?? '—'}</span></div>
      <form className="form-grid" onSubmit={save}>
        <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <input value={draft.serviceOrderId} onChange={(event) => setDraft({ ...draft, serviceOrderId: event.target.value })} placeholder="ID da OS (opcional)" />
        <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
        <input value={draft.technician} onChange={(event) => setDraft({ ...draft, technician: event.target.value })} placeholder="Responsável técnico" required />
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        <input type="date" value={draft.nextActionDate} onChange={(event) => setDraft({ ...draft, nextActionDate: event.target.value })} placeholder="Próxima revisão" />
        <textarea className="wide" value={draft.execution} onChange={(event) => setDraft({ ...draft, execution: event.target.value })} placeholder="Execução realizada" required />
        <textarea value={draft.tests} onChange={(event) => setDraft({ ...draft, tests: event.target.value })} placeholder="Testes e validações" />
        <textarea value={draft.pending} onChange={(event) => setDraft({ ...draft, pending: event.target.value })} placeholder="Pendências / próxima ação" />
        <input className="wide" value={draft.media} onChange={(event) => setDraft({ ...draft, media: event.target.value })} placeholder="Fotos / arquivos: referência, link ou nome do arquivo" />
        <div><button disabled={saving}>{saving ? 'Salvando...' : 'Registrar relatório'}</button></div>
      </form>
    </section>
    <section className="card">
      <div className="section-head"><h2>Registrar entrega de projeto</h2><span>Checklist completo antes do encerramento</span></div>
      <form className="form-grid" onSubmit={saveDelivery}>
        <input value={deliveryDraft.projectId} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, projectId: event.target.value })} placeholder="ID do projeto" required />
        <input type="date" value={deliveryDraft.date} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, date: event.target.value })} required />
        <input value={deliveryDraft.responsible} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, responsible: event.target.value })} placeholder="Responsável pela entrega" required />
        <select value={deliveryDraft.acceptance} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, acceptance: event.target.value })}><option>Aceite confirmado</option><option>Aceite pendente</option></select>
        <textarea className="wide" value={deliveryDraft.note} onChange={(event) => setDeliveryDraft({ ...deliveryDraft, note: event.target.value })} placeholder="Resumo da entrega e pendências" required />
        <div><button disabled={saving}>{saving ? 'Salvando...' : 'Registrar entrega'}</button></div>
      </form>
      <div className="group"><h3>Entregas registradas</h3>{deliveries.map((item) => <article className="card" key={item.id}><div className="section-head"><div><strong>{item.projectId}</strong><span>{item.date || 'Sem data'} Â· {item.responsible || 'Responsavel nao informado'}</span></div><strong>{item.acceptance || item.status}</strong></div><span>{item.note || 'Sem resumo informado'}</span></article>)}{!deliveries.length && <p>Nenhuma entrega registrada.</p>}</div>
    </section>
    <div className="summary"><article className="card"><span>Relatórios de serviço</span><strong>{reports.length}</strong></article><article className="card"><span>Entregas de projetos</span><strong>{deliveries.length}</strong></article></div>
    <section className="group"><h2>Histórico de serviço</h2>{loading && <p>Carregando relatórios…</p>}{!loading && reports.map((item) => <article className="card" key={item.id}><div className="section-head"><div><strong>{item.projectId}</strong><span>{item.date || 'Sem data'} · {item.technician || 'Responsável não informado'}{item.serviceOrderId ? ` · OS ${item.serviceOrderId}` : ''}</span></div><strong>{item.status}</strong></div><span>{item.execution}{item.tests ? ` · Testes: ${item.tests}` : ''}{item.pending ? ` · Pendências: ${item.pending}` : ''}</span>{item.nextActionDate && <small>Próxima revisão: {item.nextActionDate}</small>}</article>)}{!loading && !error && !reports.length && <p>Nenhum relatório disponível.</p>}</section>
    <style jsx>{`.card{display:grid;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid textarea{min-height:70px}.form-grid .wide{grid-column:span 2}.form-grid button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled{opacity:.6}.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary span,.group>p,.card>span,.section-head span{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.group{display:grid;gap:12px;padding:10px 0}.group h2{font:500 23px Georgia,serif;margin:14px 0 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head>strong{color:var(--proelium-olive)}.card small{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}.form-grid .wide{grid-column:span 2}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.summary{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
