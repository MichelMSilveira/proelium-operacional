'use client';

import { useEffect, useState } from 'react';

type Client = Record<string, unknown>;

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/data', { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar clientes.');
        setClients(Array.isArray(payload.data?.clients) ? payload.data.clients : []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar clientes.'));
  }, []);

  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">CRM</p><h1>Clientes</h1><p className="intro">Primeira área migrada em modo somente leitura.</p>{error && <p className="error">{error}</p>}<div className="list">{clients.map((client, index) => <article key={String(client.id || index)}><strong>{String(client.name || client.nome || 'Cliente sem nome')}</strong><span>{String(client.email || client.phone || client.telefone || 'Sem contato informado')}</span></article>)}{!error && clients.length === 0 && <p>Nenhum cliente disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:#f5f1eb;color:#262828;font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:#3b4a3a;color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:#66705f}.list{display:grid;gap:10px;margin-top:28px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:#fff;box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:#66705f}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
