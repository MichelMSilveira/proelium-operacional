'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: { serviceReports?: Record<string, unknown>[]; projectDeliveries?: Record<string, unknown>[] } };
export default function ReportsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar relatórios.')); }, []);
  const reports = data?.data?.serviceReports || [];
  const deliveries = data?.data?.projectDeliveries || [];
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">RELATÓRIOS</p><h1>Entregas e execução</h1><p className="intro">Registros operacionais disponíveis para consulta.</p>{error && <p className="error">{error}</p>}<div className="summary"><article><span>Relatórios de serviço</span><strong>{reports.length}</strong></article><article><span>Entregas de projetos</span><strong>{deliveries.length}</strong></article></div><div className="list">{reports.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.name || item.description || `Relatório ${index + 1}`)}</strong><span>{String(item.status || item.date || item.data || 'Registro operacional')}</span></article>)}{!error && !reports.length && <p>Nenhum relatório disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:var(--proelium-muted)}.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.list article{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.list span{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.list{display:grid;gap:10px}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
