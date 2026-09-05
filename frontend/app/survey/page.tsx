'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: { surveys?: Record<string, unknown>[]; surveyPoints?: Record<string, unknown>[] } };
export default function SurveyPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar levantamento.')); }, []);
  const surveys = payload?.data?.surveys || [];
  const points = payload?.data?.surveyPoints || [];
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">LEVANTAMENTO TÉCNICO</p><h1>Necessidades e pontos</h1><p className="intro">Levantamentos técnicos disponíveis para consulta.</p>{error && <p className="error">{error}</p>}<div className="stats"><article><span>Levantamentos</span><strong>{surveys.length}</strong></article><article><span>Pontos técnicos</span><strong>{points.length}</strong></article></div><div className="list">{surveys.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || `Levantamento ${index + 1}`)}</strong><span>{String(item.status || item.category || item.categoria || 'Sem status informado')}</span></article>)}{!error && !surveys.length && <p>Nenhum levantamento disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:var(--proelium-muted)}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.stats article,.list article{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.stats span,.list span{font-size:12px;color:var(--proelium-muted)}.stats strong{font-size:28px;color:var(--proelium-olive)}.list{display:grid;gap:10px}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
