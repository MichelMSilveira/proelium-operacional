# Frontend Next.js

Primeira fatia da migração gradual para React, TypeScript e Next.js.

Este frontend ainda não substitui o app legado. A API continua sendo a do servidor raiz (`http://localhost:4173`) e os módulos são migrados por fatias validadas.

## Rotas em transição

As rotas atuais consultam a API existente e estão inicialmente em modo somente leitura:

`/clients`, `/projects`, `/processes`, `/commercial`, `/quotes`, `/finance`, `/bi`, `/operations`, `/agenda`, `/products`, `/product-library`, `/product-connections`, `/quality`, `/knowledge`, `/equipment`, `/purchases`, `/survey`, `/reports`, `/routines`, `/installations`, `/collaborators`, `/settings`, `/users` e `/invites`.

Clientes, ConfiguraÃ§Ãµes e Convites jÃ¡ possuem fluxos de escrita validados; as demais rotas permanecem inicialmente em modo somente leitura.

OrÃ§amentos jÃ¡ permite criar rascunhos com tÃ­tulo, cliente opcional e validade. Itens, revisÃµes e aprovaÃ§Ã£o permanecem na prÃ³xima etapa.

O shell de autenticação, sessão, logout e navegação também está em Next.js. Formulários de edição, permissões de interface, sincronização em tempo real e substituição do legado permanecem como próximas etapas.

## Validação

A tela Next.js de Projetos ja faz a leitura por `GET /api/projects`, passando pelo recurso separado do NestJS. A criacao, edicao e exclusao usam `POST /api/projects`, `PATCH /api/projects/{id}` e `DELETE /api/projects/{id}`.
Clientes segue o mesmo modelo: a leitura usa `GET /api/clients` e as operacoes de escrita continuam temporariamente em `PUT /api/data`.
A criacao, edicao e exclusao de clientes usam `POST /api/clients`, `PATCH /api/clients/{id}` e `DELETE /api/clients/{id}` com payload especifico do recurso; o NestJS ainda recompÃµe a persistencia no legado.
A criacao, edicao e exclusao de projetos usam `POST /api/projects`, `PATCH /api/projects/{id}` e `DELETE /api/projects/{id}` com payload especifico do recurso; o NestJS ainda recompÃµe a persistencia no legado.
A criacao e edicao de oportunidades usam `POST /api/opportunities` e `PATCH /api/opportunities/{id}` com payload especifico do recurso; as demais validacoes do fluxo comercial permanecem no legado.
Comercial le oportunidades e orcamentos pelos recursos `GET /api/opportunities` e `GET /api/quotes`; criacao e edicao seguem nos endpoints proprios migrados.
Produtos e servicos leem os catalogos pelos recursos `GET /api/products` e `GET /api/services`; ambos podem ser criados e editados por `POST/PATCH` nos recursos correspondentes, com payload especifico e revisao de conflito.
Orcamentos le a listagem por `GET /api/quotes` e clientes por `GET /api/clients`; a criacao de rascunhos usa `POST /api/quotes` com payload especifico do recurso.
A criacao e edicao de rascunhos de Orcamento usam `POST/PATCH /api/quotes`; a exclusao remove somente rascunhos sem itens. O detalhe, ambientes, itens e aprovacao usam os recursos NestJS correspondentes.
O detalhe de Orcamento agora carrega o registro e a revisao por `GET /api/quotes/{id}`; ambientes e itens continuam em `GET/PUT /api/quotes/{id}/rooms`.
Colaboradores leem e gravam pelo recurso `GET/POST/PATCH /api/collaborators`, com normalizacao propria no NestJS; a edicao preserva campos de pagamento e o historico sem exclusao fisica.
Financeiro le lancamentos pelo recurso `GET /api/finance`, com normalizacao de valor, data, categoria, vinculacoes e status; criacao, edicao e exclusao usam `POST/PATCH/DELETE /api/finance` com revisao de conflito.
Indicadores compoe suas metricas a partir de `GET /api/clients`, `GET /api/projects`, `GET /api/opportunities`, `GET /api/quotes`, `GET /api/tasks` e `GET /api/finance`.
O resumo da pagina inicial compoe seus quatro indicadores por `GET /api/clients`, `GET /api/projects`, `GET /api/tasks` e `GET /api/finance`, sem consultar o agregado diretamente.
Compras le a lista de materiais pelo recurso `GET /api/purchases`, com normalizacao de projeto, ambiente, quantidade, fornecedor e situacao; criacao, edicao, avanço de status e exclusao usam `POST/PATCH/DELETE /api/purchases` com revisao de conflito.
Conhecimento le artigos pelo recurso `GET /api/knowledge` e grava por `POST/PATCH/DELETE /api/knowledge`, com normalizacao de titulo, categoria, resumo, base de referencia e revisao de conflito.
Usuarios da empresa leem por `GET /api/company/users` e usam `POST/DELETE /api/company/users` para ativar, desativar ou remover participantes; a criacao continua no fluxo de convites.
Levantamento le pesquisas, ambientes e pontos tecnicos por `GET /api/survey` e `GET /api/survey/{id}/rooms`; a gravacao usa `POST/PATCH /api/survey`, `POST/PATCH/DELETE /api/survey/points` e `PUT /api/survey/{id}/rooms`, com persistencia temporaria no legado. Levantamentos validados podem ser enviados ao orcamento por `POST /api/survey/{id}/send-to-quote`.
Equipamentos le ativos fisicos pelo recurso `GET /api/equipment`, com normalizacao de fabricante, modelo, numero de serie, localizacao e status; criacao e edicao usam `POST/PATCH /api/equipment` com revisao, enquanto a exclusao fisica permanece bloqueada para preservar historico.
Rotinas le rotinas da empresa e checklists de projetos pelo recurso `GET /api/routines`; rotinas usam `POST/PATCH/DELETE /api/routines` e checklists usam `POST/PATCH /api/routines/checklists`, com revisao de conflito.
O detalhe le os ambientes pelo recurso `GET /api/quotes/{id}/rooms`; criacao, renomeacao e exclusao de ambientes vazios usam `POST/PATCH/DELETE /api/quotes/{id}/rooms`.
O detalhe le produtos por `GET /api/products`, servicos por `GET /api/services` e itens do orcamento por `GET /api/quotes/{id}/items`; inclusao, edicao e exclusao usam `POST/PATCH/DELETE /api/quotes/{id}/items` com validacao de ambiente, produto, quantidade, desconto e revisao.
A gravacao coletiva legada de ambientes continua disponivel para compatibilidade, mas a tela usa os recursos especificos `POST/PATCH/DELETE /api/quotes/{id}/rooms`; o NestJS preserva os itens e a revisao informada.
A aprovacao agora usa `POST /api/quotes/{id}/approve` com `baseRevision`; o NestJS carrega os dados relacionados, calcula o total, cria ou vincula cliente e projeto e preserva a revisao.
Operacoes le tarefas por `GET /api/tasks`, com criacao, edicao e exclusao em `POST/PATCH/DELETE /api/tasks`; ordens de servico continuam vindo do recurso separado `GET /api/operations` em modo de consulta.
Agenda le e grava compromissos por `GET/POST/PATCH/DELETE /api/agenda`, com revisao de conflito e normalizacao no NestJS.
Operacoes agora le tarefas e ordens de servico pelos recursos `GET /api/tasks` e `GET /api/operations`, sem depender de `/api/data` para a consulta; tarefas e ordens usam `POST/PATCH/DELETE` nos respectivos recursos.
Relatorios le Entregas de Projetos e grava Relatorios de Servico por `GET/POST /api/reports`, com normalizacao das duas colecoes no NestJS e revisao de conflito.
Instalacoes agora le e grava pelo recurso `GET/POST/PATCH /api/installations`, com contrato normalizado no NestJS; a edicao preserva o historico sem exclusao fisica.
Qualidade le avaliacoes pelo recurso `GET /api/quality` e registra novas avaliações por `POST /api/quality`; a media considera os quatro criterios normalizados e o historico não possui exclusao fisica.
Processos ganhou a rota Next.js `/processes` com as sete etapas operacionais padrao; como o fluxo e estatico, nao depende de consulta ou gravacao no agregado.
Biblioteca tecnica le fabricantes pelo recurso `GET /api/product-library` e permite criacao/edicao por `POST/PATCH /api/product-library`; a exclusao fisica permanece bloqueada para preservar referencias.
Conexoes de produtos le o modelo tecnico pelo recurso `GET /api/products` e as ligacoes do projeto por `GET /api/diagram`; a gravacao manual usa `POST/PATCH /api/diagram/connections` com origem, portas, cabo, destino e revisao de conflito.

Na raiz do projeto, execute `npm run check:all` para validar o backend legado e o frontend Next.js juntos.

Chamados de pos-venda leem e gravam pelo recurso `GET/POST/PATCH /api/support-tickets`, com normalizacao de cliente, equipamento, tipo, prioridade e situacao no NestJS; a exclusao fisica permanece fora deste fluxo.

Entregas de projetos podem ser registradas por `POST /api/reports/deliveries`; o NestJS exige checklist completo e sincroniza projeto, instalação e atividade do cliente.

Financeiro também carrega contas pelo `GET /api/finance`; cadastro e edição usam `POST/PATCH /api/finance/accounts`, e os lançamentos vinculam uma conta ativa por seleção.

Execucao e mao de obra le e grava pelo recurso `GET/POST/PATCH /api/execution`; cada registro fica vinculado a um projeto e gera ou atualiza a despesa correspondente no Financeiro.

## Origem da API

O Levantamento Tecnico agora permite criar e editar levantamentos, ambientes e pontos, alem de excluir pontos e ambientes vazios, pela API NestJS. A persistencia ainda e encaminhada ao agregado legado com `baseRevision`, preservando o controle de concorrencia durante a migracao.

Em desenvolvimento, o proxy usa `http://localhost:4173`. No ambiente online, configure `PROELIUM_API_ORIGIN` com a origem HTTPS do servidor antes de iniciar o Next.js.
Para ativar o recurso separado de Projetos, configure tambem `PROELIUM_NEST_API_ORIGIN` com a origem do NestJS; localmente o padrao e `http://localhost:4174`.
