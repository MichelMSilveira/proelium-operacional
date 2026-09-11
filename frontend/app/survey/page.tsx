'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../lib/api';

type Survey = {
  id: string;
  opportunityId?: string;
  title: string;
  site?: string;
  source?: string;
  status: string;
  notes?: string;
  technicalSolution?: { status?: string; selectedProductIds?: string[]; confirmedAt?: string };
};

type SurveyPoint = {
  id: string;
  surveyId: string;
  room?: string;
  type: string;
  technology?: string;
  quantity?: number;
  status?: string;
  notes?: string;
};

type SurveyRoom = { id: string; surveyId: string; name: string };
type SurveyPayload = { surveys?: Survey[]; points?: SurveyPoint[]; rooms?: SurveyRoom[]; revision?: number };
type DimensioningRequirement = { kind: string; portsUsed?: number; reservePercent?: number; portsRequired?: number; minimumStandardPorts?: number | null; poeRequired?: boolean; poeWattsWithReserve?: number | null };
type DimensioningResult = { status: string; requirements?: DimensioningRequirement[]; solutions?: Array<{ ports?: number; poeRequired?: boolean; poeWattsMinimum?: number | null }>; warnings?: Array<{ message: string }> };
type CompatibilityResult = { matches?: Array<{ products?: Array<{ productId: string; name?: string; sku?: string; capacity?: number }> }>; unmatched?: Array<{ message: string }> };
type DimensioningPayload = { dimensioning?: DimensioningResult; compatibility?: CompatibilityResult };

const emptySurvey = { id: '', opportunityId: '', title: '', site: '', source: 'Preenchimento manual', status: 'Em levantamento', notes: '' };
const emptyPoint = { id: '', surveyId: '', room: '', type: '', technology: '', quantity: 1, status: 'Em levantamento', notes: '' };

export default function SurveyPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [points, setPoints] = useState<SurveyPoint[]>([]);
  const [rooms, setRooms] = useState<SurveyRoom[]>([]);
  const [dimensioningBySurvey, setDimensioningBySurvey] = useState<Record<string, DimensioningResult>>({});
  const [compatibilityBySurvey, setCompatibilityBySurvey] = useState<Record<string, CompatibilityResult>>({});
  const [revision, setRevision] = useState<number>();
  const [surveyDraft, setSurveyDraft] = useState(emptySurvey);
  const [pointDraft, setPointDraft] = useState(emptyPoint);
  const [roomDraft, setRoomDraft] = useState({ id: '', surveyId: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await apiGet<SurveyPayload>('/api/survey');
      const nextSurveys = payload.surveys || [];
      setSurveys(nextSurveys);
      setPoints(payload.points || []);
      setRooms(payload.rooms || []);
      setRevision(payload.revision);
      const dimensions = await Promise.all(nextSurveys.map(async (survey) => {
        try {
          const result = await apiGet<DimensioningPayload>(`/api/survey/${encodeURIComponent(survey.id)}/dimensioning`);
          return [survey.id, result] as const;
        } catch {
          return [survey.id, undefined] as const;
        }
      }));
      const nextDimensions: Record<string, DimensioningResult> = {};
      const nextCompatibility: Record<string, CompatibilityResult> = {};
      dimensions.forEach(([id, payload]) => { if (payload?.dimensioning) nextDimensions[id] = payload.dimensioning; if (payload?.compatibility) nextCompatibility[id] = payload.compatibility; });
      setDimensioningBySurvey(nextDimensions);
      setCompatibilityBySurvey(nextCompatibility);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar levantamento.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = surveyDraft.id || `lev-${Date.now()}`;
      const path = surveyDraft.id ? `/api/survey/${encodeURIComponent(id)}` : '/api/survey';
      const request = { survey: { ...surveyDraft, id }, baseRevision: revision };
      const result = surveyDraft.id
        ? await apiPatch<{ revision?: number }>(path, request)
        : await apiPost<{ revision?: number }>(path, request);
      setRevision(result.revision ?? revision);
      setSurveyDraft(emptySurvey);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o levantamento.');
    } finally {
      setSaving(false);
    }
  }

  async function savePoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = pointDraft.id || `ptl-${Date.now()}`;
      const path = pointDraft.id ? `/api/survey/points/${encodeURIComponent(id)}` : '/api/survey/points';
      const request = { point: { ...pointDraft, id, quantity: Number(pointDraft.quantity) || 0 }, baseRevision: revision };
      const result = pointDraft.id
        ? await apiPatch<{ revision?: number }>(path, request)
        : await apiPost<{ revision?: number }>(path, request);
      setRevision(result.revision ?? revision);
      setPointDraft({ ...emptyPoint, surveyId: pointDraft.surveyId });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o ponto tecnico.');
    } finally {
      setSaving(false);
    }
  }

  async function removePoint(id: string) {
    if (!window.confirm('Excluir este ponto tecnico?')) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/api/survey/points/${encodeURIComponent(id)}`, {});
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir o ponto tecnico.');
    } finally {
      setSaving(false);
    }
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomDraft.surveyId || !roomDraft.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const id = roomDraft.id || `room-${Date.now()}`;
      const current = rooms.filter((room) => room.surveyId === roomDraft.surveyId && room.id !== roomDraft.id);
      const result = await apiPut<{ revision?: number }>(`/api/survey/${encodeURIComponent(roomDraft.surveyId)}/rooms`, {
        rooms: [...current, { id, surveyId: roomDraft.surveyId, name: roomDraft.name.trim() }],
        baseRevision: revision,
      });
      setRevision(result.revision ?? revision);
      setRoomDraft({ id: '', surveyId: roomDraft.surveyId, name: '' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o ambiente.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRoom(room: SurveyRoom) {
    if (points.some((point) => point.surveyId === room.surveyId && point.room === room.name)) {
      setError('Remova ou mova os pontos deste ambiente antes de exclui-lo.');
      return;
    }
    if (!window.confirm(`Excluir o ambiente ${room.name}?`)) return;
    setSaving(true);
    setError('');
    try {
      const nextRooms = rooms.filter((item) => item.surveyId === room.surveyId && item.id !== room.id);
      await apiPut(`/api/survey/${encodeURIComponent(room.surveyId)}/rooms`, { rooms: nextRooms, baseRevision: revision });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir o ambiente.');
    } finally {
      setSaving(false);
    }
  }

  async function sendToQuote(survey: Survey) {
    setSaving(true);
    setError('');
    try {
      const result = await apiPost<{ quoteId?: string }>(`/api/survey/${encodeURIComponent(survey.id)}/send-to-quote`, { baseRevision: revision });
      if (result.quoteId) window.location.assign(`/quotes/${encodeURIComponent(result.quoteId)}`);
      else await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel enviar o levantamento ao orcamento.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmCompatibleProducts(survey: Survey) {
    const compatibility = compatibilityBySurvey[survey.id];
    const productIds = compatibility?.matches?.flatMap((match) => (match.products || []).map((product) => product.productId)) || [];
    if (!productIds.length) {
      setError('Nenhum produto compativel disponivel para confirmar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiPost<{ revision?: number }>(`/api/survey/${encodeURIComponent(survey.id)}/dimensioning/confirm`, { productIds, baseRevision: revision });
      setRevision(result.revision ?? revision);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel confirmar a solucao tecnica.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModuleLayout eyebrow="LEVANTAMENTO TÉCNICO" title="Necessidades e pontos" description="Construa ambientes, pontos e quantitativos antes de enviar o levantamento para orçamento.">
      {error && <p className="error">{error}</p>}
      <div className="summary">
        <article><span>Levantamentos</span><strong>{surveys.length}</strong></article>
        <article><span>Pontos técnicos</span><strong>{points.length}</strong></article>
      </div>

      <section className="card">
        <h2>{surveyDraft.id ? 'Editar levantamento' : 'Novo levantamento'}</h2>
        <form className="form-grid" onSubmit={saveSurvey}>
          <input value={surveyDraft.title} onChange={(event) => setSurveyDraft({ ...surveyDraft, title: event.target.value })} placeholder="Título do levantamento" required />
          <input value={surveyDraft.opportunityId} onChange={(event) => setSurveyDraft({ ...surveyDraft, opportunityId: event.target.value })} placeholder="ID da oportunidade (opcional)" />
          <input value={surveyDraft.site} onChange={(event) => setSurveyDraft({ ...surveyDraft, site: event.target.value })} placeholder="Local / obra" />
          <input value={surveyDraft.source} onChange={(event) => setSurveyDraft({ ...surveyDraft, source: event.target.value })} placeholder="Origem" />
          <select value={surveyDraft.status} onChange={(event) => setSurveyDraft({ ...surveyDraft, status: event.target.value })}><option>Em levantamento</option><option>Validado</option><option>Enviado ao orçamento</option></select>
          <textarea value={surveyDraft.notes} onChange={(event) => setSurveyDraft({ ...surveyDraft, notes: event.target.value })} placeholder="Premissas e observações" />
          <div><button disabled={saving}>{saving ? 'Salvando...' : surveyDraft.id ? 'Salvar levantamento' : 'Criar levantamento'}</button>{surveyDraft.id && <button type="button" className="secondary" onClick={() => setSurveyDraft(emptySurvey)}>Cancelar</button>}</div>
        </form>
      </section>

      <section className="card">
        <h2>{roomDraft.id ? 'Editar ambiente' : 'Novo ambiente'}</h2>
        <form className="form-grid" onSubmit={saveRoom}>
          <select value={roomDraft.surveyId} onChange={(event) => setRoomDraft({ ...roomDraft, surveyId: event.target.value })} required><option value="">Selecione o levantamento</option>{surveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.title}</option>)}</select>
          <input value={roomDraft.name} onChange={(event) => setRoomDraft({ ...roomDraft, name: event.target.value })} placeholder="Nome do ambiente" required />
          <div><button disabled={saving}>{saving ? 'Salvando...' : roomDraft.id ? 'Salvar ambiente' : 'Adicionar ambiente'}</button>{roomDraft.id && <button type="button" className="secondary" onClick={() => setRoomDraft({ id: '', surveyId: '', name: '' })}>Cancelar</button>}</div>
        </form>
      </section>

      <section className="card">
        <div className="section-head"><h2>Novo ponto técnico</h2><span>Revisão {revision ?? '—'}</span></div>
        <form className="form-grid" onSubmit={savePoint}>
          <select value={pointDraft.surveyId} onChange={(event) => setPointDraft({ ...pointDraft, surveyId: event.target.value })} required><option value="">Selecione o levantamento</option>{surveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.title}</option>)}</select>
          <input value={pointDraft.room} onChange={(event) => setPointDraft({ ...pointDraft, room: event.target.value })} placeholder="Ambiente" />
          <input value={pointDraft.type} onChange={(event) => setPointDraft({ ...pointDraft, type: event.target.value })} placeholder="Tipo do ponto" required />
          <input type="number" min="0" step="1" value={pointDraft.quantity} onChange={(event) => setPointDraft({ ...pointDraft, quantity: Number(event.target.value) })} placeholder="Quantidade" />
          <input value={pointDraft.technology} onChange={(event) => setPointDraft({ ...pointDraft, technology: event.target.value })} placeholder="Tecnologia" />
          <input value={pointDraft.notes} onChange={(event) => setPointDraft({ ...pointDraft, notes: event.target.value })} placeholder="Observação" />
          <button disabled={saving || !surveys.length}>{saving ? 'Salvando...' : pointDraft.id ? 'Salvar ponto' : 'Adicionar ponto'}</button>
        </form>
      </section>

      <div className="record-list">
        {surveys.map((survey) => {
          const surveyPoints = points.filter((point) => point.surveyId === survey.id);
          const surveyRooms = rooms.filter((room) => room.surveyId === survey.id);
          const ready = ['Validado', 'Enviado ao orçamento'].includes(survey.status) && surveyPoints.some((point) => Number(point.quantity || 0) > 0);
          return <article className="card" key={survey.id}><div className="section-head"><div><h2>{survey.title}</h2><span>{survey.status} · {survey.site || 'Local não informado'} · {surveyPoints.length} ponto(s) · {surveyRooms.length} ambiente(s)</span></div><span><button type="button" className="secondary" onClick={() => setSurveyDraft(surveyDraftFrom(survey))}>Editar</button><button type="button" onClick={() => void sendToQuote(survey)} disabled={saving || !ready}>Enviar ao orçamento</button></span></div>{survey.notes && <p>{survey.notes}</p>}<DimensioningPreview result={dimensioningBySurvey[survey.id]} compatibility={compatibilityBySurvey[survey.id]} confirmed={survey.technicalSolution?.status === 'confirmed'} onConfirm={() => void confirmCompatibleProducts(survey)} />{surveyRooms.length > 0 && <div className="point-list"><strong>Ambientes</strong>{surveyRooms.map((room) => <div className="point" key={room.id}><span>{room.name}</span><span><button type="button" className="secondary" onClick={() => setRoomDraft(room)}>Editar</button><button type="button" className="danger" onClick={() => void removeRoom(room)} disabled={saving}>Excluir</button></span></div>)}</div>}{surveyPoints.length > 0 && <div className="point-list"><strong>Pontos</strong>{surveyPoints.map((point) => <div className="point" key={point.id}><span><strong>{point.type}</strong> · {point.room || 'Ambiente não informado'} · qtd. {point.quantity ?? 0}</span><span><button type="button" className="secondary" onClick={() => setPointDraft(pointDraftFrom(point))}>Editar</button><button type="button" className="danger" onClick={() => void removePoint(point.id)} disabled={saving}>Excluir</button></span></div>)}</div>}</article>;
        })}
        {!error && !surveys.length && <p>Nenhum levantamento disponível.</p>}
      </div>
      <style jsx>{`.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list .card{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.section-head span,.record-list p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.form-grid input,.form-grid select,.form-grid textarea{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:var(--proelium-card);color:inherit}.form-grid textarea{min-height:44px}.form-grid button,.section-head button,.point button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.form-grid button:disabled,.point button:disabled{opacity:.6}.secondary{background:transparent!important;color:var(--proelium-olive)!important;border:1px solid var(--proelium-line)!important}.danger{background:#a33!important}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head h2{margin:0}.record-list{display:grid;gap:12px;margin-top:28px}.point-list{display:grid;gap:8px;margin-top:10px}.point{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;border-top:1px solid var(--proelium-line);font-size:13px}.point button{margin-left:6px;padding:6px 10px;font-size:12px}.dimensioning-preview{display:grid;gap:8px;margin-top:14px;padding:14px;border:1px solid var(--proelium-line);border-radius:8px;background:#f7f9f4}.dimensioning-preview header{display:flex;justify-content:space-between;gap:12px;align-items:center}.dimensioning-preview header strong{color:var(--proelium-olive)}.dimensioning-preview small{color:var(--proelium-muted)}.dimensioning-preview ul{margin:0;padding-left:18px;color:#8a4c16}@media(max-width:900px){.form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.point{align-items:flex-start;flex-direction:column}}`}</style>
    </ModuleLayout>
  );
}

function DimensioningPreview({ result, compatibility, confirmed, onConfirm }: { result?: DimensioningResult; compatibility?: CompatibilityResult; confirmed?: boolean; onConfirm?: () => void }) {
  if (!result) return null;
  const requirement = result.requirements?.find((item) => item.kind === 'switch');
  const solution = result.solutions?.find((item) => item.ports);
  const products = compatibility?.matches?.flatMap((match) => match.products || []) || [];
  return <section className="dimensioning-preview"><header><strong>Dimensionamento técnico - Rede</strong><small>{confirmed ? 'Solução confirmada' : result.status === 'dimensionado' ? 'Dimensionado' : 'Revisão necessária'}</small></header>{requirement ? <div>{requirement.portsUsed} porta(s) usadas + {requirement.reservePercent}% de reserva = <strong>{requirement.portsRequired} necessárias</strong>{solution?.ports ? <>; requisito mínimo de switch: <strong>{solution.ports} portas</strong>.</> : '.'}</div> : <div>Nenhum ponto de Rede identificado neste levantamento.</div>}{requirement?.poeRequired && <div>PoE: {requirement.poeWattsWithReserve ? `${requirement.poeWattsWithReserve} W com reserva técnica` : 'consumo ainda não informado'}.</div>}{products.length > 0 && <div><strong>Produtos compatíveis:</strong> {products.map((product) => `${product.name || product.sku || product.productId} (${product.capacity} portas)`).join(' · ')}</div>}{compatibility?.unmatched?.length ? <ul>{compatibility.unmatched.map((item, index) => <li key={`${item.message}-${index}`}>{item.message}</li>)}</ul> : null}{Boolean(result.warnings?.length) && <ul>{result.warnings?.map((warning, index) => <li key={`${warning.message}-${index}`}>{warning.message}</li>)}</ul>}{products.length > 0 && <div><button type="button" onClick={onConfirm} disabled={confirmed}>{confirmed ? 'Produtos confirmados na solução técnica' : 'Confirmar solução técnica'}</button></div>}<small>Requisitos, compatibilidade e preço continuam camadas separadas.</small></section>;
}

function surveyDraftFrom(survey: Survey) {
  return { id: survey.id, opportunityId: survey.opportunityId || '', title: survey.title, site: survey.site || '', source: survey.source || '', status: survey.status, notes: survey.notes || '' };
}

function pointDraftFrom(point: SurveyPoint) {
  return { id: point.id, surveyId: point.surveyId, room: point.room || '', type: point.type, technology: point.technology || '', quantity: point.quantity ?? 0, status: point.status || 'Em levantamento', notes: point.notes || '' };
}
