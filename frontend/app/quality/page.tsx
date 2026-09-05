'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function QualityPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { evaluations?: Item[] } }>('/api/data').then((payload) => setItems(payload.data?.evaluations || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar qualidade.')); }, []);
  const average = useMemo(() => { const values = items.map((item) => Number(item.score || item.rating || item.nota || 0)).filter(Boolean); return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—'; }, [items]);
  return <ModuleLayout eyebrow="QUALIDADE" title="Avaliações" description="Percepções de clientes e equipe sobre a operação.">{error && <p className="error">{error}</p>}<div className="summary"><article><span>Avaliações</span><strong>{items.length}</strong></article><article><span>Média</span><strong>{average}</strong></article></div><div className="record-list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.clientName || item.name || `Avaliação ${index + 1}`)}</strong><span>{String(item.score || item.rating || item.nota || 'Sem nota')} · {String(item.comment || item.comments || item.comentario || 'Sem comentário')}</span></article>)}{!error && !items.length && <p>Nenhuma avaliação disponível.</p>}</div><style jsx>{`.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list article{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.record-list{display:grid;gap:10px}`}</style></ModuleLayout>;
}
