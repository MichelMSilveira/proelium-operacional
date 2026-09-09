'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

type Project = Record<string, unknown>;
type Payload = { revision?: number; projects: Project[] };
type ProjectsPayload = { projects?: Project[]; revision?: number };

export default function ProjectsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<ProjectsPayload>('/api/projects')
      .then((resource) => setPayload({ revision: resource.revision, projects: resource.projects || [] }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar projetos.'));
  }, []);

  async function persist(projects: Project[], projectId: string, removing = false) {
    if (!payload) return;
    setSaving(true); setError('');
    try {
      const project = projects.find((item) => String(item.id) === projectId);
      const body = removing ? { baseRevision: payload.revision || 0 } : { project, baseRevision: payload.revision || 0 };
      const result = removing
        ? await apiDelete<{ revision?: number }>(`/api/projects/${projectId}`, body)
        : await apiPatch<{ revision?: number }>(`/api/projects/${projectId}`, body);
      setPayload({ revision: result.revision, projects });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o projeto.');
    } finally { setSaving(false); }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(values.name || '').trim();
    if (!name) return;
    const project = { id: `prj-next-${crypto.randomUUID()}`, name, status: String(values.status || 'Planejamento') };
    setSaving(true); setError('');
    try {
      const result = await apiPost<{ revision?: number }>('/api/projects', { project, baseRevision: payload.revision || 0 });
      setPayload({ revision: result.revision, projects: [...payload.projects, project] });
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel criar o projeto.');
    } finally { setSaving(false); }
  }

  async function editProject(project: Project) {
    const name = window.prompt('Nome do projeto', String(project.name || project.nome || ''));
    if (!name?.trim()) return;
    const status = window.prompt('Status do projeto', String(project.status || 'Planejamento'));
    if (status === null) return;
    const projects = (payload?.projects || []).map((item) => item.id === project.id
      ? { ...item, name: name.trim(), status: status.trim() || 'Planejamento' }
      : item);
    await persist(projects, String(project.id));
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`Excluir o projeto ${String(project.name || project.nome || 'sem nome')}?`)) return;
    await persist((payload?.projects || []).filter((item) => item.id !== project.id), String(project.id), true);
  }

  const projects = payload?.projects || [];
  return <ModuleLayout eyebrow="OPERACAO" title="Projetos" description="Cadastro inicial e acompanhamento de projetos.">
    {error && <p className="error">{error}</p>}
    <form className="create-form" onSubmit={createProject}>
      <input name="name" placeholder="Nome do projeto" required />
      <select name="status" defaultValue="Planejamento"><option>Planejamento</option><option>Em execucao</option><option>Concluido</option></select>
      <button disabled={saving}>{saving ? 'Salvando...' : 'Adicionar projeto'}</button>
    </form>
    <div className="record-list">
      {projects.map((project, index) => <article key={String(project.id || index)}>
        <strong>{String(project.name || project.nome || 'Projeto sem nome')}</strong>
        <span>{String(project.status || project.etapa || 'Sem status informado')}</span>
        <button type="button" onClick={() => editProject(project)} disabled={saving}>Editar</button>
        <button type="button" onClick={() => removeProject(project)} disabled={saving}>Excluir</button>
      </article>)}
      {!error && projects.length === 0 && <p>Nenhum projeto disponivel.</p>}
    </div>
  </ModuleLayout>;
}
