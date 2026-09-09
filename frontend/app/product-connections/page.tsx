'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Item = Record<string, unknown>;

function text(value: unknown, fallback = 'Nao informado') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function values(value: unknown) {
  return Array.isArray(value) && value.length ? value.map(String).join(' · ') : 'Nao informado';
}

export default function ProductConnectionsPage() {
  const [products, setProducts] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<{ products?: Item[] }>('/api/products')
      .then((payload) => { const items = payload.products || []; setProducts(items); setSelectedId(String(items[0]?.id || '')); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar produtos tecnicos.'));
  }, []);

  const product = products.find((item) => String(item.id) === selectedId);
  const model = (product?.connectionModel || {}) as Item;
  const identity = (product?.technicalIdentity || {}) as Item;
  const definition = (product?.technicalDefinition || {}) as Item;

  return <ModuleLayout eyebrow="PROJETOS 360" title="Conexoes de produtos" description="Consulte entradas, saidas, portas, cabos e compatibilidades antes do orcamento ou diagrama.">
    {error && <p className="error">{error}</p>}
    <select className="picker" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione um produto</option>{products.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || item.model || 'Produto')}</option>)}</select>
    {product && <section className="card"><h2>{text(product.name, 'Produto')}</h2><p className="muted">{text(identity.brand || product.brand)} · {text(identity.model || product.model)} · {text(identity.sku || product.sku)}</p><div className="grid"><article><small>VALIDACAO</small><strong>{text(model.verification || identity.verification || definition.status)}</strong></article><article><small>COMPATIVEL COM</small><strong>{values(model.compatibleInterfaces)}</strong></article><article><small>EXIGE</small><strong>{values(model.requirements)}</strong></article><article><small>LIMITES / INCOMPATIBILIDADES</small><strong>{values(model.constraints)}</strong></article></div><p className="source">Fonte: {text(model.officialSource || identity.source)}</p></section>}
    {!error && !products.length && <p>Nenhum produto tecnico disponivel.</p>}
    <style jsx>{`.picker{width:100%;max-width:560px;margin:24px 0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px;background:#fff}.card{padding:24px;border-radius:12px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.card h2{margin:0;font:500 25px Georgia,serif}.muted,.source{font-size:12px;color:var(--proelium-muted)}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:24px}.grid article{display:grid;gap:7px;padding:15px;border:1px solid var(--proelium-line);border-radius:8px}.grid small{font-size:10px;color:var(--proelium-muted)}.grid strong{font-size:14px;font-weight:500}@media(max-width:700px){.grid{grid-template-columns:1fr}}`}</style>
  </ModuleLayout>;
}
