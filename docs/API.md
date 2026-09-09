# Contrato inicial da API

Base: `/api/v1`. Respostas em JSON. Listagens usam `page`, `limit`, `sort` e filtros específicos.

## Sincronização do protótipo

Enquanto a API definitiva por recursos ainda não está implementada, os aplicativos usam o contrato agregado abaixo. Os dados são persistidos transacionalmente no PostgreSQL e mantêm o mesmo controle de revisão:

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/data` | carregar a base da empresa e sua revisão, filtrada pelas permissões do usuário |
| PUT | `/api/data` | salvar a base informando `baseRevision`; domínios sem permissão não podem ser alterados |
| POST | `/api/commercial/reconcile-legacy` | pré-visualizar ou aplicar, somente como administração, a reconciliação auditável das etapas comerciais legadas |
| GET | `/api/events` | receber avisos de atualização em tempo real (SSE) |

Uma gravação baseada em revisão antiga recebe HTTP `409` e não sobrescreve a versão central.

`POST /api/commercial/reconcile-legacy` recebe `{ "apply": false }` para prévia e `{ "apply": true }` para aplicar. A aplicação promove somente etapas defasadas conforme os vínculos existentes (levantamento, visita legada e orçamento), preserva Ganho/Perdido e os demais campos, registra uma entrada em `auditLog` e usa a revisão central para evitar sobrescrita concorrente. A operação não é um salto normal do funil.

As gravações que alteram o fluxo comercial são validadas no servidor: a oportunidade deve respeitar Primeiro contato → Qualificação de serviços → Levantamento técnico → Orçamento. A Qualificação de serviços exige `interests`, `needs` e `initialScope`; o levantamento precisa de oportunidade qualificada e o orçamento exige diagrama teórico validado com ao menos um ponto técnico. Cada oportunidade deve ter no máximo um levantamento novo: a UI reabre o registro associado por `opportunityId` e o servidor rejeita duplicação com HTTP `422`. Visita técnica não é etapa nem rota de Oportunidades; registros legados com esse alias são tratados como Levantamento técnico sem migração destrutiva. Os aliases legados `Novo contato`, `Qualificação` e `Visita` continuam aceitos para preservar registros existentes. Uma violação recebe HTTP `422`; estados legados não alterados são preservados.

## Recursos

| Método | Rota | Uso |
|---|---|---|
| GET/POST/PATCH | `/clients` e `/clients/{id}` | listar, criar e alterar clientes com revisão de conflito |
| DELETE | `/clients/{id}` | excluir cliente após confirmação |
| GET | `/clients/{id}/activities` | histórico de contatos do cliente |
| POST/PATCH/DELETE | `/clients/{id}/activities` e `/clients/{id}/activities/{activityId}` | registrar, alterar ou excluir atividade com revisão de conflito |
| GET/POST | `/projects` | listar/criar projetos |
| GET/PATCH | `/projects/{id}` | detalhe/alteração |
| GET/POST | `/tasks` | pendências e tarefas |
| PATCH | `/tasks/{id}` | responsável, prazo, prioridade, status |
| DELETE | `/tasks/{id}` | excluir tarefa com revisão de conflito |
| GET/POST | `/agenda` | compromissos operacionais |
| PATCH/DELETE | `/agenda/{id}` | alterar ou excluir compromisso |
| GET/POST | `/operations` | ordens de serviço |
| PATCH/DELETE | `/operations/{id}` | alterar ou excluir ordem de serviço |
| GET/POST | `/installations` | planejamento e controle de instalações |
| PATCH | `/installations/{id}` | etapa, progresso, prazo e entrega |
| GET/POST | `/routines` | procedimentos e rotinas da empresa |
| PATCH/DELETE | `/routines/{id}` | alterar ou excluir rotina |
| POST | `/routines/checklists` | criar checklist de projeto |
| PATCH | `/routines/checklists/{id}` | atualizar conclusão do checklist |
| GET/POST | `/projects` | listar e criar projetos |
| PATCH/DELETE | `/projects/{id}` | alterar ou excluir projeto |
| GET/POST | `/reports` | relatórios de serviço |
| POST | `/reports/deliveries` | registrar entrega após checklist completo |
| GET/POST | `/purchases` | materiais e itens de compra |
| PATCH/DELETE | `/purchases/{id}` | alterar status ou excluir item |
| GET/POST | `/finance` | lançamentos financeiros |
| PATCH/DELETE | `/finance/{id}` | alterar ou excluir lançamento |
| POST/PATCH | `/finance/accounts` e `/finance/accounts/{id}` | cadastrar ou alterar conta financeira |
| GET/POST | `/execution` | custos de execução por projeto |
| PATCH | `/execution/{id}` | alterar lançamento de execução |
| GET | `/diagram` | conexões, ajustes e sobrescritas técnicas |
| POST/PATCH | `/diagram/connections` e `/diagram/connections/{id}` | registrar ou alterar conexão técnica |
| GET/POST | `/opportunities` | listar e criar oportunidades |
| PATCH | `/opportunities/{id}` | alterar oportunidade com validação do funil |
| POST | `/opportunities/{id}/convert` | concluir oportunidade aprovada como ganho e criar ou reutilizar cliente |
| GET/POST | `/quotes` | orçamentos, versões, pacotes e fila de cotação |
| GET/PATCH/DELETE | `/quotes/{id}` | detalhe, alteração ou exclusão de orçamento |
| GET/POST/PATCH/DELETE | `/quotes/{id}/rooms` | ambientes do orçamento |
| GET/POST/PATCH/DELETE | `/quotes/{id}/items` | itens de catálogo por ambiente |
| POST | `/quotes/{id}/approve` | aprovar orçamento e iniciar conversão |
| GET/POST/PATCH | `/products` e `/products/{id}` | catálogo de produtos com revisão de conflito |
| GET/POST/PATCH | `/products/services` e `/products/services/{id}` | catálogo de serviços com revisão de conflito |
| POST | `/quotes/{id}/rooms/{roomId}/items` | adicionar item do catálogo ao ambiente |
| GET | `/quotes/{id}/analysis` | custo, venda e margem por ambiente |
| GET/POST | `/work-orders` | ordens de serviço |
| GET/POST | `/installations` | planejamento e controle de instalações |
| GET/PATCH | `/installations/{id}` | etapa, progresso, prazo e entrega |
| GET/POST | `/clients/{id}/activities` | histórico cronológico do cliente |
| GET/POST | `/transactions` | receitas e despesas |
| GET/POST/PATCH | `/equipment` e `/equipment/{id}` | cadastro de equipamentos com revisão de conflito |
| GET | `/equipment/{id}/history` | histórico técnico do equipamento |
| POST/PATCH/DELETE | `/equipment/{id}/history` e `/equipment/{id}/history/{historyId}` | registrar, alterar ou excluir histórico técnico com revisão de conflito |
| GET/POST/PATCH | `/collaborators` e `/collaborators/{id}` | cadastro de colaboradores com revisão de conflito |
| GET/POST | `/knowledge` | artigos e documentos |
| PATCH/DELETE | `/knowledge/{id}` | editar ou remover artigo com `baseRevision` |
| GET/POST | `/quality` | avaliações de qualidade com revisão de conflito |
| GET/POST/PATCH | `/support-tickets` e `/support-tickets/{id}` | chamados de pós-venda com revisão de conflito |
| GET/POST/PATCH | `/survey` | levantamentos técnicos e revisão |
| GET/PUT | `/survey/{id}/rooms` | ambientes do levantamento |
| POST/PATCH/DELETE | `/survey/points` | pontos técnicos e quantitativos |
| POST | `/survey/{id}/send-to-quote` | enviar levantamento validado ao orçamento |
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

A administração da plataforma usa a lista `PROELIUM_PLATFORM_ADMINS`, por username ou e-mail. O ambiente de produção mantém o usuário mestre `admin` sem e-mail e sem `companyId`; assim, o e-mail Google do proprietário pode permanecer exclusivamente como administrador da sua empresa. A conta mestre não deve ser usada para representar uma empresa nem para acessar dados empresariais sem uma autorização explícita no modelo de permissões. Usuários de suporte também não possuem empresa: `GET /api/auth/users` lista somente contas sem `companyId`, e a gravação global rejeita a tentativa de editar uma conta empresarial. O papel `suporte` não recebe dados operacionais.

`GET /api/admin/companies` retorna, para a equipe da plataforma, apenas a identidade da empresa e o contato seguro do administrador ativo (`adminName`, `adminEmail` e `adminUsername`). A central pode usar esses dados para iniciar comunicação por e-mail ou WhatsApp; não recebe clientes, projetos, orçamentos ou demais dados do ambiente empresarial. Alterações de status, licença e exclusão continuam exclusivas do administrador mestre.

Cada empresa possui administração própria: `GET/POST/DELETE /api/company/users` lista, ativa/desativa ou remove somente seus participantes; `GET/POST/DELETE /api/company/invites` cria e revoga convites somente da empresa da sessão autenticada. O primeiro usuário criado pelo cadastro Google é a conta `founder` da empresa e administra a equipe daquele `companyId`. O convite contém um token aleatório com validade de cinco minutos, armazenado no servidor somente como hash. O participante aceita o convite identificando-se com a própria conta Google; a aceitação cria/ativa o vínculo na empresa convidante, emite uma nova sessão com o `companyId` correto e não permite mover uma conta que já pertença a outra empresa. Não há criação duplicada de empresa.

O administrador empresarial também pode usar `GET/PUT /api/company/profile` para consultar e atualizar o nome, responsável, telefone e informações da própria empresa. O CPF/CNPJ permanece somente leitura. A tela de configurações é liberada mesmo durante o acesso limitado, mas não concede acesso à administração da plataforma nem altera a senha da conta Google.

O estado operacional de `/api/data` é separado por `companyId`: sessões da mesma empresa compartilham sua base e sessões de empresas diferentes não leem nem recebem eventos umas das outras. Além do isolamento por empresa, a resposta é filtrada pelo escopo licenciado do usuário: `quotes`, `quoteRooms`, `packages` e `procurementRequests` pertencem ao escopo comercial; `projects`, `projectChecklists`, `projectDeliveries` e `supportTickets` pertencem ao escopo de projetos. Assim, a conversão de um orçamento em projeto permite que colaboradores com licença pertinente ao projeto trabalhem nele sem receber o orçamento privado. Empresas com cadastro ainda `pending` recebem, durante a análise, os módulos compatíveis com `contratante`, `contratado` ou `residencial`; depois de `status=approved`, `licenseStatus=pending` não amplia o acesso e a empresa segue somente os módulos liberados pela licença. Cargos convidados continuam limitados pelas permissões do cargo. Presença, colaboração e pedidos de auxílio em `/api/events` também são filtrados pelo mesmo vínculo. `DELETE /api/admin/companies?id=...` é exclusivo da administração da plataforma: remove a empresa, convites, rotinas e estado operacional, mas converte seus usuários em perfis pessoais e registra o vínculo encerrado no portfólio. O estado legado permanece no espaço `shared` para compatibilidade do administrador técnico.

Quando uma empresa ainda não possui uma linha de estado em `app_state`, a primeira leitura de `/api/data` começa vazia para os registros operacionais. A base demonstrativa não é copiada para a empresa; somente o conhecimento genérico e o catálogo técnico inicial podem ser preparados sem dados de clientes ou projetos.

O nível e os módulos definidos para a empresa no painel da plataforma também entram na sessão dos participantes no próximo login. A conta fundadora mantém a visão dos módulos pertinentes ao tipo da empresa para avaliar o produto durante a fase de acesso limitado; um convite pode impor uma restrição adicional de módulos ao colaborador, que continua sujeito ao cargo e às permissões da empresa.

O cargo de um colaborador define o acesso padrão. O administrador da empresa pode usar `POST /api/company/users` com `companyAccessOverride: "full"` para liberar todos os domínios operacionais somente dentro do `companyId` da empresa, ou `null` para restaurar o acesso do cargo. Esse override nunca concede `platformAdmin` e não pode ser criado pelo link de convite. `GET/PUT /api/account/profile` permite que cada usuário atualize seu nome de exibição e apresentação profissional; o e-mail Google é somente leitura. O perfil pessoal não é exibido no painel de suporte e não recebe dados operacionais empresariais.

## Sessão e revogação

O cookie de sessão é assinado, protegido por `HttpOnly` e tem validade limitada. Além da assinatura e da expiração, cada rota protegida confere o usuário atual no armazenamento; se ele for removido ou desativado, a sessão antiga passa a receber HTTP 401 imediatamente, sem esperar o vencimento do cookie.
