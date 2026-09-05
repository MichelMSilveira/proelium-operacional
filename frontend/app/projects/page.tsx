'use client';

import { useEffect, useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import { apiGet } from '../../lib/api';

type Project = Record<string, unknown>;
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<{ data?: { projects?: Project[] } }>('/api/data').then((payload) => setProjects(payload.data?.projects || [])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar projetos.')); }, []);
  return <ModuleLayout eyebrow="OPERAÇÃO" title="Projetos" description="Projetos migrados inicialmente em modo somente leitura.">{error && <p className="error">{error}</p>}<div className="record-list">{projects.map((project, index) => <article key={String(project.id || index)}><strong>{String(project.name || project.nome || 'Projeto sem nome')}</strong><span>{String(project.status || project.etapa || 'Sem status informado')}</span></article>)}{!error && projects.length === 0 && <p>Nenhum projeto disponível.</p>}</div><style jsx>{`.record-list{display:grid;gap:10px;margin-top:28px}.record-list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.record-list span,.record-list>p{font-size:12px;color:var(--proelium-muted)}`}</style></ModuleLayout>;
}
