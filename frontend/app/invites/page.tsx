'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Invite = Record<string, unknown>;
export default function InvitesPage() {
  const [items, setItems] = useState<Invite[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ invites?: Invite[] }>('/api/company/invites').then((payload) => setItems(payload.invites || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar convites.')); }, []);
  return <ModuleLayout eyebrow="ACESSOS" title="Convites da empresa" description="Convites emitidos para participantes da empresa.">{error && <p className="error">{error}</p>}<div className="record-list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.email || 'Convite sem e-mail específico')}</strong><span>{String(item.role || 'Operação')} · {item.usedAt ? 'Utilizado' : 'Pendente'}</span></article>)}{!error && !items.length && <p>Nenhum convite disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
