# PROJECT — Proelium Operacional

## Identidade
Sistema interno da Proelium para operacao, CRM, orcamentos, projetos, financeiro, equipamentos, conhecimento, indicadores e gestao.

## Fonte de verdade
- este repositorio;
- documentacao operacional versionada;
- regras especificas em `.continue/rules/projeto.md`;
- instrucoes de entrega em `AGENTS.md`.

## Stack conhecida
- Node.js;
- PostgreSQL;
- frontend HTML/CSS/JavaScript existente;
- ambiente principal Windows/PowerShell.

## Limites
- nao transportar regras de outros projetos sem validacao;
- preservar dados e comportamento existente;
- nao alterar arquitetura central, banco destrutivamente, autenticacao ou producao sem autorizacao explicita;
- nao versionar segredos ou dados privados.

## Regra de retomada
Ler `AGENTS.md`, `.continue/rules/projeto.md`, este arquivo e `docs/STATUS.md` antes de alteracoes relevantes.
