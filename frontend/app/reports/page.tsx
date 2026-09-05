'use client';

import { ModuleLayout } from '../components/ModuleLayout';
import { useApi } from '../../lib/use-api';

type Item = Record<string, unknown>;
export default function ReportsPage() {
  const { data, error, loading } = useApi<{ data?: { serviceReports?: Item[]; projectDeliveries?: Item[] } }>('/api/data');
  const reports = data?.data?.serviceReports || []; const deliveries = data?.data?.projectDeliveries || [];
  return <ModuleLayout eyebrow="RELATÓRIOS" title="Entregas e execução" description="Registros operacionais disponíveis para consulta.">{error && <p className="error">{error}</p>}{loading && <p className="intro">Carregando relatórios…</p>}{!loading && <><div className="summary"><article><span>Relatórios de serviço</span><strong>{reports.length}</strong></article><article><span>Entregas de projetos</span><strong>{deliveries.length}</strong></article></div><div className="record-list">{reports.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.name || item.description || `Relatório ${index + 1}`)}</strong><span>{String(item.status || item.date || item.data || 'Registro operacional')}</span></article>)}{!error && !reports.length && <p>Nenhum relatório disponível.</p>}</div></>}<style jsx>{`.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list article{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.record-list{display:grid;gap:10px}`}</style></ModuleLayout>;
}
