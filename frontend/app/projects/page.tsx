'use client';

import { useEffect, useState } from 'react';

type Project = Record<string, unknown>;

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/data', { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar projetos.');
        setProjects(Array.isArray(payload.data?.projects) ? payload.data.projects : []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar projetos.'));
  }, []);

  return <main className="page"><header><strong>PROELIUM</strong><a href="/">Voltar ao painel</a></header><section><p className="eyebrow">OPERAÇÃO</p><h1>Projetos</h1><p className="intro">Primeira versão migrada em modo somente leitura.</p>{error && <p className="error">{error}</p>}<div className="list">{projects.map((project, index) => <article key={String(project.id || index)}><strong>{String(project.name || project.nome || 'Projeto sem nome')}</strong><span>{String(project.status || project.etapa || 'Sem status informado')}</span></article>)}{!error && projects.length === 0 && <p>Nenhum projeto disponível.</p>}</div></section><style jsx>{`.page{min-height:100vh;background:#f5f1eb;color:#262828;font:15px Arial,sans-serif}.page header{display:flex;justify-content:space-between;padding:20px 6%;background:#3b4a3a;color:#fff}.page a{color:#fff}.page section{max-width:900px;margin:auto;padding:48px 6%}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.2em}.page h1{font:500 36px Georgia,serif}.intro,.list>p{color:#66705f}.list{display:grid;gap:10px;margin-top:28px}.list article{display:grid;gap:6px;padding:18px;border-radius:10px;background:#fff;box-shadow:0 5px 20px #26282812}.list span{font-size:12px;color:#66705f}.error{padding:10px;border-radius:7px;background:#fbe8e4;color:#9d423b}`}</style></main>;
}
