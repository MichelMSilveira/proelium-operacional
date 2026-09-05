'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function ReportsPage() {
  const [data, setData] = useState<Record<string, Item[]>>({});
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: Record<string, Item[]> }>('/api/data').then((payload) => setData({ serviceReports: payload.data?.serviceReports || [], projectDeliveries: payload.data?.projectDeliveries || [] })).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar relatórios.')); }, []);
  const reports = data.serviceReports || [];
  const deliveries = data.projectDeliveries || [];
  return <ModuleLayout eyebrow="RELATÓRIOS" title="Entregas e execução" description="Registros operacionais disponíveis para consulta.">{error && <p className="error">{error}</p>}<div className="summary"><article><span>Relatórios de serviço</span><strong>{reports.length}</strong></article><article><span>Entregas de projetos</span><strong>{deliveries.length}</strong></article></div><div className="record-list">{reports.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.name || item.description || `Relatório ${index + 1}`)}</strong><span>{String(item.status || item.date || item.data || 'Registro operacional')}</span></article>)}{!error && !reports.length && <p>Nenhum relatório disponível.</p>}</div><style jsx>{`.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list article{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.record-list{display:grid;gap:10px}`}</style></ModuleLayout>;
}
