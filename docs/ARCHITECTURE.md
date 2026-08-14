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

O protótipo atual não fixa o framework de produção. Ele valida navegação, campos e fluxos antes de assumir esse custo.

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
2. Implementar autenticação, PostgreSQL e API.
3. Migrar dados existentes e adicionar anexos/auditoria.
4. Conectar o N.E.M.O. primeiro em modo somente leitura.
5. Liberar ações assistidas com permissões e registro completo.

