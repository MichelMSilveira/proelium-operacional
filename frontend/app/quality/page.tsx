'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
type QualityPayload = { evaluations?: Item[] };

function evaluationScore(item: Item) {
  const direct = Number(item.score || item.rating || item.nota || 0);
  if (direct) return direct;
  const values = ['installation', 'service', 'commitment', 'deadline'].map((key) => Number(item[key] || 0)).filter(Boolean);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export default function QualityPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet<QualityPayload>('/api/quality')
      .then((payload) => setItems(payload.evaluations || []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar avaliações.'))
      .finally(() => setLoading(false));
  }, []);
  const average = useMemo(() => { const values = items.map(evaluationScore).filter(Boolean); return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—'; }, [items]);
  return <ModuleLayout eyebrow="QUALIDADE" title="Avaliações" description="Percepções de clientes e equipe sobre a operação.">{error && <p className="error">{error}</p>}{loading && <p className="intro">Carregando avaliações…</p>}{!loading && <><div className="summary"><article><span>Avaliações</span><strong>{items.length}</strong></article><article><span>Média</span><strong>{average}</strong></article></div><div className="record-list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.clientName || item.name || `Avaliação ${index + 1}`)}</strong><span>{evaluationScore(item) ? evaluationScore(item).toFixed(1) : 'Sem nota'} · {String(item.comment || item.comments || item.comentario || item.note || 'Sem comentário')}</span></article>)}{!items.length && <p>Nenhuma avaliação disponível.</p>}</div></>}</ModuleLayout>;
}
