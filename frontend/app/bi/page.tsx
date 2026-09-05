'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Payload = { data?: Record<string, unknown[]> };
const metrics = [['clients', 'Clientes'], ['projects', 'Projetos'], ['opportunities', 'Oportunidades'], ['quotes', 'Orçamentos'], ['tasks', 'Tarefas'], ['financialEntries', 'Lançamentos']];
export default function BiPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar indicadores.')); }, []);
  return <ModuleLayout eyebrow="INDICADORES" title="Visão operacional" description="Indicadores iniciais calculados sobre os dados autorizados pela API.">{error && <p className="error">{error}</p>}<div className="metric-grid">{metrics.map(([key, label]) => <article key={key}><span>{label}</span><strong>{payload?.data?.[key]?.length ?? '—'}</strong></article>)}</div><style jsx>{`.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}.metric-grid article{display:grid;gap:14px;padding:22px;border-radius:12px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.metric-grid span{color:var(--proelium-muted);font-size:12px}.metric-grid strong{font-size:32px;color:var(--proelium-olive)}@media(max-width:650px){.metric-grid{grid-template-columns:repeat(2,1fr)}}`}</style></ModuleLayout>;
}
