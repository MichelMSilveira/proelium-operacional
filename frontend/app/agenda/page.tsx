'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function AgendaPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { appointments?: Item[] } }>('/api/data').then((payload) => setItems(payload.data?.appointments || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar agenda.')); }, []);
  return <ModuleLayout eyebrow="PLANEJAMENTO" title="Agenda" description="Compromissos e próximos eventos da operação.">{error && <p className="error">{error}</p>}<div className="record-list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.title || item.name || item.description || `Compromisso ${index + 1}`)}</strong><span>{String(item.date || item.startAt || item.data || 'Data não informada')} · {String(item.status || item.type || item.tipo || 'Agendado')}</span></article>)}{!error && !items.length && <p>Nenhum compromisso disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
