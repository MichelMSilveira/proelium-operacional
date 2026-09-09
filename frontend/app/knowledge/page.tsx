'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Article = Record<string, unknown>;
type Payload = { articles: Article[]; revision?: number };

export default function KnowledgePage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ articles?: Article[]; revision?: number }>('/api/knowledge')
      .then((resource) => setPayload({ articles: resource.articles || [], revision: resource.revision }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar conhecimento.'));
  }, []);

  async function createArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const title = String(values.title || '').trim();
    if (!title) return;
    const article = { id: `art-next-${crypto.randomUUID()}`, title, tag: String(values.tag || 'Referencia tecnica').trim(), summary: String(values.summary || '').trim(), basis: String(values.basis || '').trim() };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/knowledge', { article, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, articles: [article, ...payload.articles] });
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o artigo.');
    } finally { setSaving(false); }
  }

  async function editArticle(article: Article) {
    if (!payload) return;
    const title = window.prompt('Titulo do artigo', String(article.title || ''))?.trim();
    if (!title || title === String(article.title || '')) return;
    setSaving(true); setError('');
    try {
      const result = await apiPatch<{ revision?: number }>(`/api/knowledge/${encodeURIComponent(String(article.id))}`, { article: { id: article.id, title, tag: article.tag, summary: article.summary, basis: article.basis }, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, articles: payload.articles.map((item) => item.id === article.id ? { ...item, title } : item) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel editar o artigo.');
    } finally { setSaving(false); }
  }

  async function deleteArticle(article: Article) {
    if (!payload || !window.confirm(`Excluir o artigo ${String(article.title || 'sem titulo')}?`)) return;
    setSaving(true); setError('');
    try {
      const result = await apiDelete<{ revision?: number }>(`/api/knowledge/${encodeURIComponent(String(article.id))}`, { baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, articles: payload.articles.filter((item) => item.id !== article.id) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir o artigo.');
    } finally { setSaving(false); }
  }

  const articles = payload?.articles || [];
  return <ModuleLayout eyebrow="CONHECIMENTO" title="Biblioteca tecnica" description="Artigos e referencias disponiveis para a operacao.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createArticle}>
      <input name="title" placeholder="Titulo do artigo" required />
      <input name="tag" placeholder="Categoria / tag" defaultValue="Referencia tecnica" />
      <input name="summary" placeholder="Resumo" />
      <input name="basis" placeholder="Fonte ou base de validacao" />
      <button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar artigo'}</button>
    </form>
    <div className="record-list">{articles.map((article, index) => <article key={String(article.id || index)}><strong>{String(article.title || article.name || 'Artigo sem titulo')}</strong><span>{String(article.tag || article.category || 'Referencia tecnica')}</span><p>{String(article.summary || 'Sem resumo informado.')}</p><small>{String(article.basis || 'Base interna a validar.')}</small><div><button type="button" disabled={saving} onClick={() => editArticle(article)}>Editar</button><button type="button" disabled={saving} onClick={() => deleteArticle(article)}>Excluir</button></div></article>)}{!error && !articles.length && <p>Nenhum artigo disponivel.</p>}</div>
    <style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list small,.record-list p,.record-list>p{font-size:12px;color:var(--proelium-muted)}.record-list button{margin-right:8px;padding:8px 12px;border:1px solid var(--proelium-line);border-radius:6px;background:transparent;cursor:pointer}`}</style>
  </ModuleLayout>;
}
