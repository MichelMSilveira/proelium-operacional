'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Entry = Record<string, unknown>;

export default function ProductLibraryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ entries?: Entry[]; revision?: number }>('/api/product-library')
      .then((payload) => { setEntries(payload.entries || []); setRevision(payload.revision || 0); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar biblioteca tecnica.'));
  }, []);

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name || '').trim();
    if (!name) return;
    const entry = { id: `mfr-next-${crypto.randomUUID()}`, name, areas: String(values.areas || '').trim(), source: String(values.source || '').trim(), status: 'Fonte oficial a consultar' };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/product-library', { entry, baseRevision: revision });
      setEntries((current) => [...current, entry]); setRevision(result.revision || 0); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o fabricante.'); } finally { setSaving(false); }
  }

  async function editEntry(entry: Entry) {
    const name = window.prompt('Nome do fabricante', String(entry.name || ''));
    if (!name?.trim()) return;
    const areas = window.prompt('Areas tecnicas', String(entry.areas || entry.category || ''));
    if (areas === null) return;
    const updated = { ...entry, name: name.trim(), areas: areas.trim() };
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/product-library/${String(entry.id)}`, { entry: updated, baseRevision: revision });
      setEntries((current) => current.map((item) => item.id === entry.id ? updated : item)); setRevision(result.revision || 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel editar o fabricante.'); } finally { setSaving(false); }
  }

  return <ModuleLayout eyebrow="PROJETOS 360" title="Biblioteca tecnica" description="Fabricantes e referencias para orientar produtos, servicos e ligacoes.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createEntry}><input name="name" placeholder="Nome do fabricante" required /><input name="areas" placeholder="Areas tecnicas" /><input name="source" placeholder="Fonte oficial" /><button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar fabricante'}</button></form>
    <div className="record-list">{entries.map((entry, index) => <article key={String(entry.id || index)}><div><strong>{String(entry.name || `Fabricante ${index + 1}`)}</strong><span>{String(entry.areas || entry.category || 'Areas nao informadas')}</span><small>{String(entry.source || entry.status || 'Fonte nao informada')}</small></div><button type="button" onClick={() => editEntry(entry)} disabled={saving}>Editar</button></article>)}{!error && !entries.length && <p>Nenhum fabricante disponivel.</p>}</div>
    <style jsx>{`.create-form{display:grid;grid-template-columns:2fr 2fr 2fr auto;gap:8px;margin:24px 0}.create-form input{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px}.create-form button,.record-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.create-form button:disabled,.record-list button:disabled{opacity:.6}.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list article div{display:grid;gap:6px}.record-list span,.record-list small,.record-list>p{font-size:12px;color:var(--proelium-muted)}@media(max-width:800px){.create-form{grid-template-columns:1fr}}`}</style>
  </ModuleLayout>;
}
