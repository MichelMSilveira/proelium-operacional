'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function OperationsPage() {
  const [data, setData] = useState<Record<string, Item[]>>({});
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: Record<string, Item[]> }>('/api/data').then((payload) => setData({ tasks: payload.data?.tasks || [], serviceOrders: payload.data?.serviceOrders || [] })).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar operação.')); }, []);
  const list = (key: string, title: string) => <section className="group"><h2>{title}</h2>{data[key]?.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.name || item.description || `${title} ${index + 1}`)}</strong><span>{String(item.status || item.stage || item.etapa || 'Sem status informado')}</span></article>)}{!error && !data[key]?.length && <p>Nenhum registro disponível.</p>}</section>;
  return <ModuleLayout eyebrow="OPERAÇÃO" title="Execução operacional" description="Tarefas e ordens de serviço migradas em modo somente leitura.">{error && <p className="error">{error}</p>}{list('tasks', 'Tarefas')}{list('serviceOrders', 'Ordens de serviço')}<style jsx>{`.group{padding:10px 0}.group h2{font:500 23px Georgia,serif}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.group span,.group>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
