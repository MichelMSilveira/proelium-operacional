'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;
type Connection = Item & { id: string; projectId: string; fromId: string; fromLabel: string; fromPort: string; toId: string; toLabel: string; toPort: string; cable: string; status: string };
type Draft = { id: string; projectId: string; fromId: string; fromPort: string; toId: string; toPort: string; cable: string; status: string };
type ProductPayload = { products?: Item[] };
type ProjectPayload = { projects?: Item[] };
type DiagramPayload = { connections?: Connection[]; revision?: number };

const statuses = ['Proposto - confirmar', 'Confirmado em campo', 'Ajuste manual - confirmar'];

function text(value: unknown, fallback = 'Nao informado') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function values(value: unknown) {
  return Array.isArray(value) && value.length ? value.map(String).join(' · ') : 'Nao informado';
}

function emptyDraft(projectId = '', productId = ''): Draft {
  return { id: '', projectId, fromId: productId, fromPort: '', toId: '', toPort: '', cable: 'Cat6', status: statuses[0] };
}

export default function ProductConnectionsPage() {
  const [products, setProducts] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [revision, setRevision] = useState<number>();
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [productPayload, projectPayload, diagramPayload] = await Promise.all([
        apiGet<ProductPayload>('/api/products'),
        apiGet<ProjectPayload>('/api/projects'),
        apiGet<DiagramPayload>('/api/diagram'),
      ]);
      const nextProducts = productPayload.products || [];
      const nextProjects = projectPayload.projects || [];
      setProducts(nextProducts);
      setProjects(nextProjects);
      setConnections(diagramPayload.connections || []);
      setRevision(diagramPayload.revision);
      setSelectedId((current) => current || String(nextProducts[0]?.id || ''));
      setDraft((current) => current.projectId ? current : emptyDraft(String(nextProjects[0]?.id || ''), String(nextProducts[0]?.id || '')));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar conexoes tecnicas.');
    }
  }

  useEffect(() => { void load(); }, []);

  const product = products.find((item) => String(item.id) === selectedId);
  const model = (product?.connectionModel || {}) as Item;
  const identity = (product?.technicalIdentity || {}) as Item;
  const definition = (product?.technicalDefinition || {}) as Item;
  const projectConnections = useMemo(() => connections.filter((item) => item.projectId === draft.projectId), [connections, draft.projectId]);

  function productLabel(id: string) {
    const item = products.find((candidate) => String(candidate.id) === id);
    return text(item?.name || item?.model, id || 'Nao informado');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = products.find((item) => String(item.id) === draft.fromId);
    const target = products.find((item) => String(item.id) === draft.toId);
    if (!draft.projectId || !source || !target || draft.fromId === draft.toId) {
      setError('Escolha um projeto, uma origem e um destino diferentes.');
      return;
    }
    if (!draft.fromPort.trim() || !draft.toPort.trim() || !draft.cable.trim()) {
      setError('Informe as portas e o cabo antes de salvar.');
      return;
    }
    setSaving(true); setError('');
    const connection = {
      id: draft.id || `conn-next-${crypto.randomUUID()}`,
      projectId: draft.projectId,
      fromId: draft.fromId,
      fromLabel: productLabel(draft.fromId),
      fromPort: draft.fromPort.trim(),
      toId: draft.toId,
      toLabel: productLabel(draft.toId),
      toPort: draft.toPort.trim(),
      cable: draft.cable.trim(),
      status: draft.status,
      cableCount: 1,
      origin: 'Manual Proelium',
    };
    try {
      const result = draft.id
        ? await apiPatch<{ revision?: number }>(`/api/diagram/connections/${encodeURIComponent(draft.id)}`, { connection, baseRevision: revision })
        : await apiPost<{ revision?: number }>('/api/diagram/connections', { connection, baseRevision: revision });
      setRevision(result.revision ?? revision);
      setDraft(emptyDraft(draft.projectId, draft.fromId));
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar a conexao.');
    } finally {
      setSaving(false);
    }
  }

  return <ModuleLayout eyebrow="PROJETOS 360" title="Conexoes de produtos" description="Consulte o modelo tecnico e registre ligacoes manuais antes do orcamento ou diagrama.">
    {error && <p className="error">{error}</p>}
    <select className="picker" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione um produto</option>{products.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || item.model || 'Produto')}</option>)}</select>
    {product && <section className="card"><h2>{text(product.name, 'Produto')}</h2><p className="muted">{text(identity.brand || product.brand)} · {text(identity.model || product.model)} · {text(identity.sku || product.sku)}</p><div className="grid"><article><small>VALIDACAO</small><strong>{text(model.verification || identity.verification || definition.status)}</strong></article><article><small>COMPATIVEL COM</small><strong>{values(model.compatibleInterfaces)}</strong></article><article><small>EXIGE</small><strong>{values(model.requirements)}</strong></article><article><small>LIMITES / INCOMPATIBILIDADES</small><strong>{values(model.constraints)}</strong></article></div><p className="source">Fonte: {text(model.officialSource || identity.source)}</p></section>}
    <section className="card connection-card"><div className="section-head"><div><h2>{draft.id ? 'Ajustar ligacao' : 'Nova ligacao manual'}</h2><p className="muted">A compatibilidade continua dependendo da confirmacao tecnica em campo.</p></div><span>Revisao {revision ?? '—'}</span></div><form className="form-grid" onSubmit={save}><select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} required><option value="">Selecione o projeto</option>{projects.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || item.nome || 'Projeto')}</option>)}</select><select value={draft.fromId} onChange={(event) => setDraft({ ...draft, fromId: event.target.value })} required><option value="">Origem</option>{products.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || item.model || 'Produto')}</option>)}</select><input value={draft.fromPort} onChange={(event) => setDraft({ ...draft, fromPort: event.target.value })} placeholder="Porta de saida" required /><select value={draft.toId} onChange={(event) => setDraft({ ...draft, toId: event.target.value })} required><option value="">Destino</option>{products.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || item.model || 'Produto')}</option>)}</select><input value={draft.toPort} onChange={(event) => setDraft({ ...draft, toPort: event.target.value })} placeholder="Porta de entrada" required /><input value={draft.cable} onChange={(event) => setDraft({ ...draft, cable: event.target.value })} placeholder="Cabo / sinal" required /><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><div className="actions"><button disabled={saving}>{saving ? 'Salvando...' : draft.id ? 'Salvar ligacao' : 'Registrar ligacao'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyDraft(draft.projectId, draft.fromId))}>Cancelar</button>}</div></form></section>
    <section className="card connection-card"><div className="section-head"><h2>Ligacoes registradas</h2><span>{projectConnections.length} neste projeto</span></div>{!draft.projectId && <p className="muted">Selecione um projeto para consultar suas ligacoes.</p>}{draft.projectId && projectConnections.length === 0 && <p>Nenhuma ligacao manual registrada neste projeto.</p>}{projectConnections.length > 0 && <div className="connection-list">{projectConnections.map((connection) => <article key={connection.id}><div><strong>{connection.fromLabel} · {connection.fromPort}</strong><span>→ {connection.cable} → {connection.toLabel} · {connection.toPort}</span><small>{connection.status}</small></div><button type="button" className="secondary" onClick={() => setDraft({ id: connection.id, projectId: connection.projectId, fromId: connection.fromId, fromPort: connection.fromPort, toId: connection.toId, toPort: connection.toPort, cable: connection.cable, status: connection.status })}>Ajustar</button></article>)}</div>}</section>
    {!error && !products.length && <p>Nenhum produto tecnico disponivel.</p>}
    <style jsx>{`.picker{width:100%;max-width:560px;margin:24px 0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:#fff}.card{padding:24px;margin-bottom:18px;border-radius:12px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.card h2{margin:0;font:500 25px Georgia,serif}.muted,.source{font-size:12px;color:var(--proelium-muted)}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:24px}.grid article{display:grid;gap:7px;padding:15px;border:1px solid var(--proelium-line);border-radius:8px}.grid small{font-size:10px;color:var(--proelium-muted)}.grid strong{font-size:14px;font-weight:500}.section-head{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:16px}.section-head span{font-size:12px;color:var(--proelium-muted)}.form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.form-grid input,.form-grid select{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:#fff}.actions{display:flex;gap:8px;align-items:center}.actions button,.connection-list button{padding:10px 14px;border:0;border-radius:7px;background:var(--proelium-ink);color:#fff;cursor:pointer}.actions .secondary,.connection-list .secondary{background:transparent;color:var(--proelium-ink);border:1px solid var(--proelium-line)}.connection-list{display:grid;gap:10px}.connection-list article{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px;border:1px solid var(--proelium-line);border-radius:8px}.connection-list article div{display:grid;gap:5px}.connection-list span,.connection-list small{font-size:12px;color:var(--proelium-muted)}@media(max-width:700px){.grid,.form-grid{grid-template-columns:1fr}.connection-list article{align-items:start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
