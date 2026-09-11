# Arquitetura proposta

## Visão

```text
App web responsivo
        │
        ▼
API REST versionada (/api/v1)
        │
  ┌─────┴──────────────┐
  ▼                    ▼
Serviços de domínio   Eventos/auditoria
  │                    │
  └─────┬──────────────┘
        ▼
PostgreSQL + armazenamento de arquivos
        ▲
        │ OAuth/API key de serviço
        │
     N.E.M.O.
```

## Stack sugerida para produção

- Frontend: React + TypeScript.
- Backend: API TypeScript (Fastify/NestJS) ou Python (FastAPI).
- Banco: PostgreSQL.
- Arquivos: storage compatível com S3.
- Autenticação: provedor OIDC, com RBAC por organização.
- Jobs/eventos: fila transacional quando surgirem notificações e integrações.

O frontend e o contrato agregado de `/api/data` permanecem no protótipo atual. O armazenamento principal já utiliza PostgreSQL com transações, histórico de revisões, migrações e espelho JSON temporário. A normalização por recurso e a API `/api/v1` continuam como evolução posterior.

## Dimensionamento técnico

O fluxo comercial passa a reservar uma etapa entre levantamento e orçamento: `Levantamento → Regras técnicas → Solução técnica → Produtos compatíveis → Orçamento`. O núcleo inicial está em `technical-dimensioning.js`, como função pura compartilhada pelo shell e pelo NestJS. Ele recebe necessidades e pontos, produz requisitos genéricos e mantém a origem dos pontos em `trace`; não conhece catálogo, marcas, custos ou preços. `technical-compatibility.js` recebe o resultado do dimensionamento e o catálogo, devolvendo referências compatíveis e justificativas sem expor preço ou custo. A rota `GET /api/survey/{id}/dimensioning` expõe as duas prévias para a tela Next.js, e `POST /api/survey/{id}/dimensioning/confirm` registra os IDs escolhidos em `extra_data.technicalSolution`, com validação de compatibilidade e revisão concorrente. A seleção de itens no orçamento e a precificação permanecem como próxima etapa, evitando acoplamento com o orçamento atual.

## Preparação para o N.E.M.O.

- API versionada e documentada.
- IDs UUID, timestamps e campos estruturados.
- endpoint de resumo operacional, evitando que o agente precise juntar dezenas de chamadas;
- busca textual na base de conhecimento;
- trilha de auditoria com `actor_type = user | service | nemo`;
- ações mutáveis idempotentes e com confirmação para operações sensíveis;
- webhooks/eventos futuros como `task.overdue`, `project.blocked` e `budget.approved`.

## Fases

1. Validar o protótipo e os campos com 2–3 projetos reais.
2. Implementar autenticação e PostgreSQL mantendo compatibilidade com a API atual. **Concluído.**
3. Normalizar recursos gradualmente e adicionar anexos/auditoria estruturada.
4. Conectar o N.E.M.O. primeiro em modo somente leitura.
5. Liberar ações assistidas com permissões e registro completo.

## Integração da solução técnica com o orçamento

Quando o levantamento possui uma solução técnica confirmada, o mapeador comercial usa as referências selecionadas para gerar os itens do orçamento. A camada comercial consulta os preços atuais do catálogo somente nessa etapa; levantamentos sem confirmação continuam usando o mapeamento legado como fallback. Assim, regras e requisitos permanecem independentes de marcas e preços.
