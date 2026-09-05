'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Entry = Record<string, unknown>;
export default function FinancePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { financialEntries?: Entry[] } }>('/api/data').then((payload) => setEntries(payload.data?.financialEntries || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar financeiro.')); }, []);
  const total = useMemo(() => entries.reduce((sum, item) => sum + Number(item.amount || item.value || item.valor || 0), 0), [entries]);
  return <ModuleLayout eyebrow="FINANCEIRO" title="Financeiro" description="Lançamentos autorizados e total calculado localmente, em modo somente leitura.">{error && <p className="error">{error}</p>}<div className="total"><span>Total dos lançamentos</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div className="record-list">{entries.map((entry, index) => <article key={String(entry.id || index)}><strong>{String(entry.description || entry.name || entry.nome || `Lançamento ${index + 1}`)}</strong><span>{String(entry.type || entry.category || entry.categoria || 'Sem categoria')} · {Number(entry.amount || entry.value || entry.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></article>)}{!error && entries.length === 0 && <p>Nenhum lançamento disponível.</p>}</div><style jsx>{`.total{display:flex;justify-content:space-between;align-items:center;margin:28px 0;padding:20px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.total span,.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.total strong{font-size:24px;color:var(--proelium-olive)}.record-list{display:grid;gap:10px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}`}</style></ModuleLayout>;
}
