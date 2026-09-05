'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function EquipmentPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { equipment?: Item[] } }>('/api/data').then((payload) => setItems(payload.data?.equipment || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar equipamentos.')); }, []);
  return <ModuleLayout eyebrow="EQUIPAMENTOS" title="Catálogo técnico" description="Equipamentos autorizados para consulta na operação.">{error && <p className="error">{error}</p>}<div className="record-list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.nome || item.model || `Equipamento ${index + 1}`)}</strong><span>{String(item.manufacturer || item.brand || item.fabricante || '')} · {String(item.status || item.location || item.localizacao || 'Sem status informado')}</span></article>)}{!error && !items.length && <p>Nenhum equipamento disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
