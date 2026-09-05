'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function RoutinesPage() {
  const [data, setData] = useState<Record<string, Item[]>>({});
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: Record<string, Item[]> }>('/api/data').then((payload) => setData({ routines: payload.data?.routines || [], projectChecklists: payload.data?.projectChecklists || [] })).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar rotinas.')); }, []);
  const routines = data.routines || [];
  const checklists = data.projectChecklists || [];
  return <ModuleLayout eyebrow="PADRONIZAÇÃO" title="Rotinas e checklists" description="Procedimentos operacionais disponíveis para consulta.">{error && <p className="error">{error}</p>}<div className="summary"><article><span>Rotinas</span><strong>{routines.length}</strong></article><article><span>Checklists</span><strong>{checklists.length}</strong></article></div><div className="record-list">{routines.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || `Rotina ${index + 1}`)}</strong><span>{String(item.status || item.category || item.categoria || 'Procedimento')}</span></article>)}{!error && !routines.length && <p>Nenhuma rotina disponível.</p>}</div><style jsx>{`.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:28px 0}.summary article,.record-list article{display:grid;gap:8px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.summary span,.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.summary strong{font-size:28px;color:var(--proelium-olive)}.record-list{display:grid;gap:10px}`}</style></ModuleLayout>;
}
