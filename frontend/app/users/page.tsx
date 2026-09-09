'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPost } from '../../lib/api';

type User = Record<string, unknown>;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try { const payload = await apiGet<{ users?: User[] }>('/api/company/users'); setUsers(payload.users || []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao carregar usuarios.'); }
  }

  useEffect(() => { void load(); }, []);

  async function toggleUser(user: User) {
    setSaving(true); setError('');
    try { await apiPost('/api/company/users', { username: user.username, active: user.active === false }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel atualizar o usuario.'); }
    finally { setSaving(false); }
  }

  async function removeUser(user: User) {
    if (!window.confirm(`Remover ${String(user.name || user.username || 'este usuario')} da empresa?`)) return;
    setSaving(true); setError('');
    try { await apiDelete(`/api/company/users?username=${encodeURIComponent(String(user.username))}`, {}); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel remover o usuario.'); }
    finally { setSaving(false); }
  }

  return <ModuleLayout eyebrow="ACESSOS" title="Usuarios da empresa" description="Participantes e funcoes da empresa autenticada.">
    {error && <p className="error">{error}</p>}
    <div className="record-list">{users.map((user, index) => <article key={String(user.username || user.id || index)}><div><strong>{String(user.name || user.username || 'Usuario')}</strong><span>{String(user.email || '')} · {String(user.role || 'Funcao nao informada')} · {user.active === false ? 'Inativo' : 'Ativo'}</span></div><div><button type="button" disabled={saving || user.role === 'admin'} onClick={() => toggleUser(user)}>{user.active === false ? 'Ativar' : 'Desativar'}</button>{user.role !== 'admin' && <button type="button" disabled={saving} onClick={() => removeUser(user)}>Remover</button>}</div></article>)}{!error && !users.length && <p>Nenhum usuario disponivel.</p>}</div>
    <style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list article>div:first-child{display:grid;gap:6px}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}.record-list button{margin-left:8px;padding:8px 12px;border:1px solid var(--proelium-line);border-radius:6px;background:transparent;cursor:pointer}@media(max-width:700px){.record-list article{align-items:flex-start;flex-direction:column}}`}</style>
  </ModuleLayout>;
}
