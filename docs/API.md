# Contrato inicial da API

Base: `/api/v1`. Respostas em JSON. Listagens usam `page`, `limit`, `sort` e filtros específicos.

## Sincronização do protótipo

Enquanto a API definitiva por recursos ainda não está implementada, os aplicativos usam o contrato agregado abaixo. Os dados são persistidos transacionalmente no PostgreSQL e mantêm o mesmo controle de revisão:

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/data` | carregar a base central e sua revisão |
| PUT | `/api/data` | salvar a base informando `baseRevision` |
| GET | `/api/events` | receber avisos de atualização em tempo real (SSE) |

Uma gravação baseada em revisão antiga recebe HTTP `409` e não sobrescreve a versão central.

## Recursos

| Método | Rota | Uso |
|---|---|---|
| GET/POST | `/clients` | listar/criar clientes |
| GET/PATCH | `/clients/{id}` | detalhe/alteração |
| DELETE | `/clients/{id}` | excluir cliente e registros vinculados após confirmação |
| GET/POST | `/projects` | listar/criar projetos |
| GET/PATCH | `/projects/{id}` | detalhe/alteração |
| GET/POST | `/tasks` | pendências e tarefas |
| PATCH | `/tasks/{id}` | responsável, prazo, prioridade, status |
| GET/POST | `/quotes` | orçamentos e versões |
| GET/POST | `/products` | catálogo de produtos, materiais e serviços |
| GET/POST | `/quotes/{id}/rooms` | cômodos ou ambientes do orçamento |
| POST | `/quotes/{id}/rooms/{roomId}/items` | adicionar item do catálogo ao ambiente |
| GET | `/quotes/{id}/analysis` | custo, venda e margem por ambiente |
| POST | `/quotes/{id}/approve` | registrar aprovação |
| GET/POST | `/work-orders` | ordens de serviço |
| GET/POST | `/installations` | planejamento e controle de instalações |
| GET/PATCH | `/installations/{id}` | etapa, progresso, prazo e entrega |
| GET/POST | `/clients/{id}/activities` | histórico cronológico do cliente |
| GET/POST | `/transactions` | receitas e despesas |
| GET/POST | `/equipment` | estoque e equipamentos instalados |
| GET/POST | `/knowledge` | artigos e documentos |
| GET | `/search?q=` | busca transversal |
| GET | `/operational-summary` | resumo otimizado para painel/N.E.M.O. |
| GET | `/analytics/projects?groupBy=` | indicadores agrupados para Business Intelligence |
| GET | `/audit-events` | trilha de alterações |

## Exemplo: resumo operacional

```json
{
  "generatedAt": "2026-08-14T16:00:00Z",
  "projects": { "active": 8, "blocked": 1, "late": 2 },
  "tasks": { "open": 19, "overdue": 4, "dueToday": 3 },
  "finance": { "approvedCents": 24500000, "costCents": 15740000 },
  "attention": [
    { "type": "task", "id": "...", "reason": "overdue" }
  ]
}
```

## Segurança para o N.E.M.O.

O N.E.M.O. recebe credencial de serviço com escopos explícitos, por exemplo `projects:read`, `tasks:read` e, numa fase posterior, `tasks:write`. Toda escrita aceita `Idempotency-Key`, registra autor/origem e retorna o evento de auditoria criado.
# Multiempresa

`POST /api/auth/register-company` cria uma empresa e seu primeiro usuário administrador. Após o login, `GET /api/company/routines` lista as rotinas da empresa e `PUT /api/company/routines` substitui sua coleção de rotinas.

O acesso público usa Google OAuth com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`. Um e-mail Google novo cria uma solicitação de empresa; um e-mail já vinculado entra diretamente. A rota `GET/PUT /api/admin/companies` é exclusiva da administração da plataforma.

Cada empresa possui administração própria: `GET/POST/DELETE /api/company/users` lista, ativa/desativa ou remove somente seus participantes; `GET/POST/DELETE /api/company/invites` cria e revoga convites. O convite contém um token aleatório com validade de cinco minutos, armazenado no servidor somente como hash. O participante aceita o convite identificando-se com a própria conta Google; não há criação duplicada de empresa.

O estado operacional de `/api/data` é separado por `companyId`: sessões da mesma empresa compartilham sua base e sessões de empresas diferentes não leem nem recebem eventos umas das outras. O estado legado permanece no espaço `shared` para compatibilidade do administrador técnico.
