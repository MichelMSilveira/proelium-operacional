'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: Record<string, Record<string, unknown>[]> };
export default function OperationsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar operação.')); }, []);
  const section = (key: string, title: string) => <section className="group"><h2>{title}</h2>{data?.data?.[key]?.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.name || item.description || `${title} ${index + 1}`)}</strong><span>{String(item.status || item.stage || item.etapa || 'Sem status informado')}</span></article>)}{!error && !data?.data?.[key]?.length && <p>Nenhum registro disponível.</p>}</section>;
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">OPERAÇÃO</p><h1>Execução operacional</h1><p className="intro">Tarefas e ordens de serviço migradas em modo somente leitura.</p>{error && <p className="error">{error}</p>}{section('tasks', 'Tarefas')}{section('serviceOrders', 'Ordens de serviço')}</section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1,.group h2{font-family:Georgia,serif;font-weight:500}.page h1{font-size:36px}.intro,.group>p{color:var(--proelium-muted)}.group{padding:10px 0}.group h2{font-size:23px}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.group span{font-size:12px;color:var(--proelium-muted)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
