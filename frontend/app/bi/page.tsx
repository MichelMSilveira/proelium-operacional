'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: Record<string, unknown[]> };
const metrics = [['clients', 'Clientes'], ['projects', 'Projetos'], ['opportunities', 'Oportunidades'], ['quotes', 'Orçamentos'], ['tasks', 'Tarefas'], ['financialEntries', 'Lançamentos']];

export default function BiPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar indicadores.')); }, []);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">INDICADORES</p><h1>Visão operacional</h1><p className="intro">Indicadores iniciais calculados sobre os dados já autorizados pela API.</p>{error && <p className="error">{error}</p>}<div className="grid">{metrics.map(([key, label]) => <article key={key}><span>{label}</span><strong>{payload?.data?.[key]?.length ?? '—'}</strong></article>)}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.page h1{font:500 36px Georgia,serif}.intro{color:var(--proelium-muted)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}.grid article{display:grid;gap:14px;padding:22px;border-radius:12px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.grid span{color:var(--proelium-muted);font-size:12px}.grid strong{font-size:32px;color:var(--proelium-olive)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}@media(max-width:650px){.grid{grid-template-columns:repeat(2,1fr)}}`}</style></main>;
}
