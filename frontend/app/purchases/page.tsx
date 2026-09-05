'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: { purchaseItems?: Record<string, unknown>[] } };
export default function PurchasesPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then((payload) => setItems(payload.data?.purchaseItems || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar compras.')); }, []);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">COMPRAS</p><h1>Materiais e compras</h1><p className="intro">Itens de compra vinculados à operação, em modo somente leitura.</p>{error && <p className="error">{error}</p>}<div className="list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.description || item.nome || `Item ${index + 1}`)}</strong><span>Quantidade: {String(item.quantity || item.quantidade || 1)} · {String(item.status || item.supplier || item.fornecedor || 'Sem status informado')}</span></article>)}{!error && items.length === 0 && <p>Nenhum item de compra disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:var(--proelium-muted)}.list{display:grid;gap:10px;margin-top:28px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:var(--proelium-muted)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
