'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;
type ProductPayload = { products?: Item[]; revision?: number };
type ServicesPayload = { services?: Item[]; revision?: number };

export default function ProductsPage() {
  const [products, setProducts] = useState<Item[]>([]);
  const [services, setServices] = useState<Item[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiGet<ProductPayload>('/api/products'), apiGet<ServicesPayload>('/api/services')])
      .then(([resource, servicesResource]) => {
        setProducts(resource.products || []);
        setRevision(servicesResource.revision ?? resource.revision ?? 0);
        setServices(servicesResource.services || []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar catalogo.'));
  }, []);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name || '').trim();
    if (!name) return;
    const product = {
      id: `prd-next-${crypto.randomUUID()}`,
      name,
      sku: String(values.sku || '').trim(),
      category: String(values.category || '').trim(),
      unit: String(values.unit || 'un').trim() || 'un',
      price: Math.max(0, Number(values.price || 0)),
      active: true,
    };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/products', { product, baseRevision: revision });
      setProducts((current) => [...current, product]);
      setRevision(result.revision || 0);
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o produto.');
    } finally { setSaving(false); }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name || '').trim();
    if (!name) return;
    const service = {
      id: `svc-next-${crypto.randomUUID()}`,
      name,
      category: String(values.category || '').trim(),
      unit: String(values.unit || 'h').trim() || 'h',
      price: Math.max(0, Number(values.price || 0)),
      active: true,
      catalogType: 'service',
    };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/services', { service, baseRevision: revision });
      setServices((current) => [...current, service]);
      setRevision(result.revision || 0);
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o servico.');
    } finally { setSaving(false); }
  }

  async function editProduct(product: Item) {
    const name = window.prompt('Nome do produto', String(product.name || product.nome || ''));
    if (!name?.trim()) return;
    const price = window.prompt('Preco do produto', String(product.price || 0));
    if (price === null) return;
    const updated = { ...product, name: name.trim(), price: Math.max(0, Number(price || 0)) };
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/products/${String(product.id)}`, { product: updated, baseRevision: revision });
      setProducts((current) => current.map((item) => item.id === product.id ? updated : item));
      setRevision(result.revision || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel editar o produto.');
    } finally { setSaving(false); }
  }

  async function editService(service: Item) {
    const name = window.prompt('Nome do servico', String(service.name || service.nome || ''));
    if (!name?.trim()) return;
    const price = window.prompt('Preco do servico', String(service.price || 0));
    if (price === null) return;
    const updated = { ...service, name: name.trim(), price: Math.max(0, Number(price || 0)), catalogType: 'service' };
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/services/${String(service.id)}`, { service: updated, baseRevision: revision });
      setServices((current) => current.map((item) => item.id === service.id ? updated : item));
      setRevision(result.revision || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel editar o servico.');
    } finally { setSaving(false); }
  }

  const list = (items: Item[], title: string, editable = false) => <section className="group"><h2>{title}</h2>{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || item.nome || `${title} ${index + 1}`)}</strong><span>{String(item.category || item.unit || item.unidade || item.description || 'Sem classificacao')}</span>{editable && <button type="button" onClick={() => editProduct(item)} disabled={saving}>Editar</button>}</article>)}{!error && !items.length && <p>Nenhum item disponivel.</p>}</section>;

  return <ModuleLayout eyebrow="CATALOGO" title="Produtos e servicos" description="Itens comerciais disponiveis para consulta e manutencao.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createProduct}><input name="name" placeholder="Nome do produto" required /><input name="sku" placeholder="SKU / modelo" /><input name="category" placeholder="Categoria" /><input name="unit" placeholder="Unidade" defaultValue="un" /><input name="price" type="number" min="0" step="0.01" placeholder="Preco" /><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar produto'}</button></form>
    <form className="create-form" onSubmit={createService}><input name="name" placeholder="Nome do servico" required /><input name="category" placeholder="Categoria" /><input name="unit" placeholder="Unidade" defaultValue="h" /><input name="price" type="number" min="0" step="0.01" placeholder="Preco" /><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar servico'}</button></form>
    {list(products, 'Produtos', true)}
    <section className="group"><h2>Servicos</h2>{services.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.title || item.nome || `Servico ${index + 1}`)}</strong><span>{String(item.category || item.unit || item.unidade || item.description || 'Sem classificacao')}</span><button type="button" onClick={() => editService(item)} disabled={saving}>Editar</button></article>)}{!error && !services.length && <p>Nenhum item disponivel.</p>}</section>
    <style jsx>{`.create-form{display:grid;grid-template-columns:2fr 1fr 1fr 80px 110px auto;gap:8px;margin:24px 0}.create-form input{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px}.create-form button,.group button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.create-form button:disabled,.group button:disabled{opacity:.6}.group{padding:10px 0}.group h2{font:500 23px Georgia,serif}.group article{display:grid;gap:6px;margin:10px 0;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.group span,.group>p{font-size:12px;color:var(--proelium-muted)}@media(max-width:900px){.create-form{grid-template-columns:1fr 1fr}.create-form button{width:100%}}`}</style>
  </ModuleLayout>;
}
