'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Article = Record<string, unknown>;
export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { articles?: Article[] } }>('/api/data').then((payload) => setArticles(payload.data?.articles || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar conhecimento.')); }, []);
  return <ModuleLayout eyebrow="CONHECIMENTO" title="Biblioteca técnica" description="Artigos e referências disponíveis para a operação.">{error && <p className="error">{error}</p>}<div className="record-list">{articles.map((article, index) => <article key={String(article.id || index)}><strong>{String(article.title || article.name || 'Artigo sem título')}</strong><span>{String(article.category || article.tags || 'Referência técnica')}</span></article>)}{!error && !articles.length && <p>Nenhum artigo disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
