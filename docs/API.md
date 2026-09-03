# Contrato inicial da API

Base: `/api/v1`. Respostas em JSON. Listagens usam `page`, `limit`, `sort` e filtros específicos.

## Sincronização do protótipo

Enquanto a API definitiva por recursos ainda não está implementada, os aplicativos usam o contrato agregado abaixo. Os dados são persistidos transacionalmente no PostgreSQL e mantêm o mesmo controle de revisão:

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/data` | carregar a base da empresa e sua revisão, filtrada pelas permissões do usuário |
| PUT | `/api/data` | salvar a base informando `baseRevision`; domínios sem permissão não podem ser alterados |
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

Cada empresa possui administração própria: `GET/POST/DELETE /api/company/users` lista, ativa/desativa ou remove somente seus participantes; `GET/POST/DELETE /api/company/invites` cria e revoga convites somente da empresa da sessão autenticada. O convite contém um token aleatório com validade de cinco minutos, armazenado no servidor somente como hash. O participante aceita o convite identificando-se com a própria conta Google; a aceitação cria/ativa o vínculo na empresa convidante, emite uma nova sessão com o `companyId` correto e não permite mover uma conta que já pertença a outra empresa. Não há criação duplicada de empresa.

O estado operacional de `/api/data` é separado por `companyId`: sessões da mesma empresa compartilham sua base e sessões de empresas diferentes não leem nem recebem eventos umas das outras. Além do isolamento por empresa, a resposta é filtrada pelo escopo licenciado do usuário: `quotes`, `quoteRooms`, `packages` e `procurementRequests` pertencem ao escopo comercial; `projects`, `projectChecklists`, `projectDeliveries` e `supportTickets` pertencem ao escopo de projetos. Assim, a conversão de um orçamento em projeto permite que colaboradores com licença pertinente ao projeto trabalhem nele sem receber o orçamento privado. Presença, colaboração e pedidos de auxílio em `/api/events` também são filtrados pelo mesmo vínculo. `DELETE /api/admin/companies?id=...` é exclusivo da administração da plataforma e remove a empresa junto com usuários, convites, rotinas e estado operacional vinculados. O estado legado permanece no espaço `shared` para compatibilidade do administrador técnico.

O nível e os módulos definidos para a empresa no painel da plataforma também entram na sessão do proprietário no próximo login. Um convite pode impor uma restrição adicional de módulos ao colaborador; quando há módulos individuais na sessão, eles são usados como o escopo desse vínculo.

## Sessão e revogação

O cookie de sessão é assinado, protegido por `HttpOnly` e tem validade limitada. Além da assinatura e da expiração, cada rota protegida confere o usuário atual no armazenamento; se ele for removido ou desativado, a sessão antiga passa a receber HTTP 401 imediatamente, sem esperar o vencimento do cookie.
