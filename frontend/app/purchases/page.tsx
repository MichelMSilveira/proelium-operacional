'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function PurchasesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { purchaseItems?: Item[] } }>('/api/data').then((payload) => setItems(payload.data?.purchaseItems || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar compras.')); }, []);
  return <ModuleLayout eyebrow="COMPRAS" title="Materiais e compras" description="Itens de compra vinculados à operação, em modo somente leitura.">{error && <p className="error">{error}</p>}<div className="record-list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.description || item.nome || `Item ${index + 1}`)}</strong><span>Quantidade: {String(item.quantity || item.quantidade || 1)} · {String(item.status || item.supplier || item.fornecedor || 'Sem status informado')}</span></article>)}{!error && !items.length && <p>Nenhum item de compra disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
