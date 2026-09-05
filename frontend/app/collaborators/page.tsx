'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Payload = { data?: { collaborators?: Record<string, unknown>[] } };
export default function CollaboratorsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<Payload>('/api/data').then((payload) => setItems(payload.data?.collaborators || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar colaboradores.')); }, []);
  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">PESSOAS</p><h1>Colaboradores e parceiros</h1><p className="intro">Equipe disponível para consulta na operação.</p>{error && <p className="error">{error}</p>}<div className="list">{items.map((item, index) => <article key={String(item.id || index)}><strong>{String(item.name || item.nome || `Colaborador ${index + 1}`)}</strong><span>{String(item.role || item.specialty || item.especialidade || item.type || 'Função não informada')}</span></article>)}{!error && items.length === 0 && <p>Nenhum colaborador disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:var(--proelium-sand);color:var(--proelium-ink);font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:var(--proelium-olive);color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:var(--proelium-muted)}.list{display:grid;gap:10px;margin-top:28px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:var(--proelium-muted)}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
