"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModuleLayout } from "../components/ModuleLayout";
import { apiGet, apiPut } from "../../lib/api";

type Project = Record<string, unknown>;
type Payload = { revision?: number; data?: { projects?: Project[] } };

export default function ProjectsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { apiGet<Payload>("/api/data").then(setPayload).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao carregar projetos.")); }, []);
  async function persist(projects: Project[]) {
    if (!payload?.data) return;
    setSaving(true); setError("");
    try { const result = await apiPut<{ revision?: number }>("/api/data", { data: { ...payload.data, projects }, baseRevision: payload.revision || 0 }); setPayload({ revision: result.revision, data: { ...payload.data, projects } }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o projeto."); } finally { setSaving(false); }
  }
  async function createProject(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!payload?.data) return; const values = Object.fromEntries(new FormData(event.currentTarget)); const name = String(values.name || "").trim(); if (!name) return; await persist([...(payload.data.projects || []), { id: `prj-next-${crypto.randomUUID()}`, name, status: String(values.status || "Planejamento") }]); event.currentTarget.reset(); }
  async function editProject(project: Project) { const name = window.prompt("Nome do projeto", String(project.name || project.nome || "")); if (!name?.trim()) return; const status = window.prompt("Status do projeto", String(project.status || "Planejamento")); if (status === null) return; await persist((payload?.data?.projects || []).map((item) => item.id === project.id ? { ...item, name: name.trim(), status: status.trim() || "Planejamento" } : item)); }
  async function removeProject(project: Project) { if (!window.confirm(`Excluir o projeto ${String(project.name || project.nome || "sem nome")}?`)) return; await persist((payload?.data?.projects || []).filter((item) => item.id !== project.id)); }
  const projects = payload?.data?.projects || [];
  return <ModuleLayout eyebrow="OPERAÇÃO" title="Projetos" description="Cadastro inicial e acompanhamento de projetos.">{error && <p className="error">{error}</p>}<form className="create-form" onSubmit={createProject}><input name="name" placeholder="Nome do projeto" required /><select name="status" defaultValue="Planejamento"><option>Planejamento</option><option>Em execução</option><option>Concluído</option></select><button disabled={saving}>{saving ? "Salvando…" : "Adicionar projeto"}</button></form><div className="record-list">{projects.map((project, index) => <article key={String(project.id || index)}><strong>{String(project.name || project.nome || "Projeto sem nome")}</strong><span>{String(project.status || project.etapa || "Sem status informado")}</span><button type="button" onClick={() => editProject(project)} disabled={saving}>Editar</button><button type="button" onClick={() => removeProject(project)} disabled={saving}>Excluir</button></article>)}{!error && projects.length === 0 && <p>Nenhum projeto disponível.</p>}</div></ModuleLayout>;
}
