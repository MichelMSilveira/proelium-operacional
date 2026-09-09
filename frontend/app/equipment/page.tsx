'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

type Item = Record<string, unknown>;

export default function EquipmentPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ equipment?: Item[]; revision?: number }>('/api/equipment')
      .then((payload) => { setItems(payload.equipment || []); setRevision(payload.revision || 0); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar equipamentos.'));
  }, []);

  async function createEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name || '').trim();
    if (!name) return;
    const equipment = {
      id: `eqp-next-${crypto.randomUUID()}`,
      name,
      manufacturer: String(values.manufacturer || '').trim(),
      model: String(values.model || '').trim(),
      serialNumber: String(values.serialNumber || '').trim(),
      location: String(values.location || '').trim(),
      status: String(values.status || 'Ativo').trim() || 'Ativo',
    };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/equipment', { equipment, baseRevision: revision });
      setItems((current) => [...current, equipment]); setRevision(result.revision || 0); event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o equipamento.');
    } finally { setSaving(false); }
  }

  async function editEquipment(item: Item) {
    const name = window.prompt('Nome do equipamento', String(item.name || item.nome || item.model || ''));
    if (!name?.trim()) return;
    const status = window.prompt('Status do equipamento', String(item.status || 'Ativo'));
    if (status === null) return;
    const updated = { ...item, name: name.trim(), status: status.trim() || 'Ativo' };
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/equipment/${String(item.id)}`, { equipment: updated, baseRevision: revision });
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry)); setRevision(result.revision || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel editar o equipamento.');
    } finally { setSaving(false); }
  }

  return <ModuleLayout eyebrow="EQUIPAMENTOS" title="Catálogo técnico" description="Equipamentos autorizados para consulta e manutenção na operação.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createEquipment}>
      <input name="name" placeholder="Nome do equipamento" required />
      <input name="manufacturer" placeholder="Fabricante" />
      <input name="model" placeholder="Modelo" />
      <input name="serialNumber" placeholder="Número de série" />
      <input name="location" placeholder="Localização" />
      <button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar equipamento'}</button>
    </form>
    <div className="record-list">
      {items.map((item, index) => <article key={String(item.id || index)}>
        <strong>{String(item.name || item.nome || item.model || `Equipamento ${index + 1}`)}</strong>
        <span>{String(item.manufacturer || item.brand || item.fabricante || '')} · {String(item.status || item.location || item.localizacao || 'Sem status informado')}</span>
        <button type="button" onClick={() => editEquipment(item)} disabled={saving}>Editar</button>
      </article>)}
      {!error && !items.length && <p>Nenhum equipamento disponível.</p>}
    </div>
    <style jsx>{`.create-form{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;gap:8px;margin:24px 0}.create-form input{min-width:0;padding:11px;border:1px solid var(--proelium-line);border-radius:7px}.create-form button,.record-list button{border:0;border-radius:7px;padding:10px 14px;background:var(--proelium-orange);color:#fff;font-weight:700;cursor:pointer}.create-form button:disabled,.record-list button:disabled{opacity:.6}.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}@media(max-width:1100px){.create-form{grid-template-columns:1fr 1fr}.create-form button{width:100%}}`}</style>
  </ModuleLayout>;
}
