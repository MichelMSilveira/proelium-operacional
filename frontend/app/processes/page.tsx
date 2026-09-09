'use client';

import { ModuleLayout } from '../components/ModuleLayout';

const stages = [
  ['Entrada e qualificacao', 'Dados minimos do cliente e da demanda', 'Comercial'],
  ['Visita e levantamento', 'Checklist, responsavel e condicao de conclusao', 'Comercial'],
  ['Orcamento e aprovacao', 'Checklist, responsavel e condicao de conclusao', 'Comercial'],
  ['Planejamento e compras', 'Checklist, responsavel e condicao de conclusao', 'Operacao'],
  ['Execucao', 'Checklist, responsavel e condicao de conclusao', 'Operacao'],
  ['Testes e entrega', 'Checklist, responsavel e condicao de conclusao', 'Operacao'],
  ['Pos-venda', 'Garantia, manutencao e historico', 'Operacao'],
] as const;

export default function ProcessesPage() {
  return <ModuleLayout eyebrow="PROJETOS 360" title="Processos" description="Fluxo operacional padrao reutilizado em cada projeto.">
    <div className="stage-list">{stages.map(([title, description, area], index) => <article key={title}><strong>{index + 1}</strong><div><h2>{title}</h2><p>{description}</p></div><span>{area}</span></article>)}</div>
    <style jsx>{`.stage-list{display:grid;gap:10px;margin-top:28px}.stage-list article{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:14px;padding:18px;border-radius:10px;background:var(--proelium-card);box-shadow:0 5px 20px #26282812}.stage-list article>strong{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--proelium-olive);color:#fff}.stage-list h2{margin:0;font:500 20px Georgia,serif}.stage-list p,.stage-list span{margin:5px 0 0;font-size:12px;color:var(--proelium-muted)}.stage-list span{margin:0}`}</style>
  </ModuleLayout>;
}
