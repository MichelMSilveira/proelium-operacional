'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: { installations?: Record<string, unknown>[] } };
export default function InstallationsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then((payload) => setItems(payload.data?.installations || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar instalações.')); }, []);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">CAMPO</p><h1>Instalações</h1><p className="intro">Execuções em campo disponíveis para acompanhamento.</p>{error && <p className="error">{error}</p>}<div className="list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || item.description || `Instalação ${index + 1}`)}</strong><span>{String(item.projectName || item.project || item.local || '')} · {String(item.status || item.stage || item.etapa || 'Sem status informado')}</span></article>)}{!error && items.length === 0 && <p>Nenhuma instalação disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:var(--proelium-muted)}.list{display:grid;gap:10px;margin-top:28px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:var(--proelium-muted)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
