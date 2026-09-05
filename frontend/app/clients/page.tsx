'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Client = Record<string, unknown>;
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { clients?: Client[] } }>('/api/data').then((payload) => setClients(payload.data?.clients || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar clientes.')); }, []);
  return <ModuleLayout eyebrow="CRM" title="Clientes" description="Primeira área migrada em modo somente leitura.">{error && <p className="error">{error}</p>}<div className="record-list">{clients.map((client, index) => <article key={String(client.id || index)}><strong>{String(client.name || client.nome || 'Cliente sem nome')}</strong><span>{String(client.email || client.phone || client.telefone || 'Sem contato informado')}</span></article>)}{!error && clients.length === 0 && <p>Nenhum cliente disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
