'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;
export default function ProductsPage() {
  const [data, setData] = useState<Record<string, Item[]>>({});
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: Record<string, Item[]> }>('/api/data').then((payload) => setData({ products: payload.data?.products || [], services: payload.data?.services || [] })).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar catálogo.')); }, []);
  const list = (key: string, title: string) => <section className="group"><h2>{title}</h2>{data[key]?.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || item.nome || `${title} ${index + 1}`)}</strong><span>{String(item.category || item.unit || item.unidade || item.description || 'Sem classificação')}</span></article>)}{!error && !data[key]?.length && <p>Nenhum item disponível.</p>}</section>;
  return <ModuleLayout eyebrow="CATÁLOGO" title="Produtos e serviços" description="Itens comerciais disponíveis para consulta.">{error && <p className="error">{error}</p>}{list('products', 'Produtos')}{list('services', 'Serviços')}<style jsx>{`.group{padding:10px 0}.group h2{font:500 23px Georgia,serif}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.group span,.group>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
