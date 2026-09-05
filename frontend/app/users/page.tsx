'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type User = Record<string, unknown>;
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ users?: User[] }>('/api/company/users').then((payload) => setUsers(payload.users || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar usuários.')); }, []);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">ACESSOS</p><h1>Usuários da empresa</h1><p className="intro">Participantes e funções da empresa autenticada.</p>{error && <p className="error">{error}</p>}<div className="list">{users.map((user, index) => <article key={String(user.username || user.id || index)}><strong>{String(user.name || user.username || 'Usuário')}</strong><span>{String(user.email || '')} · {String(user.role || 'Função não informada')} · {user.active === false ? 'Inativo' : 'Ativo'}</span></article>)}{!error && users.length === 0 && <p>Nenhum usuário disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:var(--proelium-muted)}.list{display:grid;gap:10px;margin-top:28px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:var(--proelium-muted)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
