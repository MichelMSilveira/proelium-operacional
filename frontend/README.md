# Frontend Next.js

O shell Next.js está publicado nas rotas de módulos e na porta interna `4300`; a raiz pública ainda permanece no shell legado até a validação autenticada final. Não remover o servidor raiz enquanto PWA, Android, Windows e o fallback sem PostgreSQL dependerem dele.

Frontend em React, TypeScript e Next.js, com os módulos operacionais publicados no shell Next.js.

O shell de autenticação, sessão, logout e navegação está implementado em Next.js. O servidor raiz continua atendendo a raiz pública, a ponte de compatibilidade e o fallback sem PostgreSQL.

## Rotas

O frontend possui as rotas `/clients`, `/projects`, `/processes`, `/commercial`, `/quotes`, `/finance`, `/bi`, `/operations`, `/agenda`, `/products`, `/product-library`, `/product-connections`, `/quality`, `/knowledge`, `/equipment`, `/purchases`, `/survey`, `/reports`, `/routines`, `/installations`, `/collaborators`, `/settings`, `/users` e `/invites`.

As telas que já possuem operações de negócio usam endpoints específicos do NestJS, incluindo clientes, projetos, oportunidades, produtos, serviços, orçamentos, ambientes, itens, financeiro, compras, colaboradores, agenda, tarefas, ordens de serviço, relatórios, instalações, qualidade, conhecimento, equipamentos, rotinas, biblioteca técnica, conexões, chamados, execução, levantamento técnico e usuários da empresa.

Indicadores e o resumo inicial são consultas compostas por recursos separados. Processos é um fluxo estático e não depende de gravação.

## Estado da migração

Projetos usam `projects_domain_entries` e `projects_domain_state`, com isolamento por `companyId`, revisão própria, progresso entre 0 e 100, orçamento não negativo e importação inicial durante a migração `027_projects_domain.sql`. Os vínculos dos demais domínios continuam por `projectId` durante a migração gradual.
Financeiro usa `finance_domain_entries`, `finance_domain_accounts` e `finance_domain_state`, com isolamento por `companyId`, revisão própria, validação de lançamentos e importação inicial durante a migração `029_finance_domain.sql`. Lançamentos mantêm referências textuais a clientes, projetos e contas durante a transição; custos criados pela Execução são sincronizados nessa coleção.
Execução usa `execution_domain_entries` e `execution_domain_state`, com isolamento por `companyId`, revisão própria, validação do projeto e importação inicial durante a migração `030_execution_domain.sql`. Cada custo mantém `financialEntryId` para sincronização com o Financeiro.
Diagrama técnico usa `diagram_domain_connections`, `diagram_domain_aux_records` e `diagram_domain_state`, com isolamento por `companyId`, revisão própria, validação do projeto e importação inicial durante a migração `031_diagram_domain.sql`.
Oportunidades usam `opportunities_domain_entries` e `opportunities_domain_state`, com isolamento por `companyId`, revisão própria e importação inicial durante a migração `032_opportunities_domain.sql`. A validação do funil, a gravação e a conversão de oportunidade aprovada em cliente já operam diretamente no NestJS usando os domínios PostgreSQL relacionados; a ponte legada permanece apenas como fallback sem PostgreSQL.
Orçamentos usam `quotes_domain_entries`, `quotes_domain_rooms`, `quotes_domain_packages`, `quotes_domain_procurement_requests` e `quotes_domain_state`, com isolamento por `companyId`, revisão própria e importação inicial durante as migrações `033_quotes_domain.sql` e `035_quotes_auxiliary_domain.sql`. Listagem, criação, ambientes e itens já são lidos ou gravados diretamente; edição, exclusão, o ciclo completo de ambientes e os itens de catálogo também usam transações próprias, ambientes e pacotes mantêm seus itens em JSONB para preservar o cálculo atual, enquanto mutações, aprovação e conversão posterior atualizam diretamente os domínios comerciais. O agregado legado ficou restrito ao fallback sem PostgreSQL.
Compras usam `purchases_domain_entries` e `purchases_domain_state`, com isolamento por `companyId`, revisão própria, quantidade positiva e importação inicial durante a migração `028_purchases_domain.sql`. Os itens preservam referências textuais a projetos, ambientes, produtos e fornecedores durante a transição.
Relatórios e entregas usam `reports_domain_service_entries`, `reports_domain_delivery_entries` e `reports_domain_state`, com isolamento por `companyId`, revisão própria e importação inicial durante a migração `026_reports_domain.sql`. O serviço atualiza diretamente OS, agenda, instalação, checklist, projetos e o histórico de atividades do CRM; o contrato legado fica apenas como fallback quando o PostgreSQL não está configurado.

Rotinas usam a tabela existente `routines` e `routines_domain_state`, com isolamento por `companyId`, revisão própria e gravação direta pelo NestJS. Checklists usam `project_checklists_domain_entries` e `project_checklists_domain_state`, com revisão própria; Relatórios valida a entrega consultando essa coleção durante a transição.

Instalações usam `installations_domain_entries` e `installations_domain_state`, com isolamento por `companyId`, revisão própria, progresso limitado entre 0 e 100 e importação inicial dos registros existentes durante a migração `023_installations_domain.sql`. Entregas e relatórios vinculados continuam nos recursos operacionais legados até suas migrações específicas.

Ordens de serviço usam `service_orders_domain_entries` e `service_orders_domain_state`, com isolamento por `companyId`, revisão própria, importação inicial dos registros existentes durante a migração `022_service_orders_domain.sql` e referências textuais a cliente, projeto e equipamento para preservar dados durante a transição.

Agenda usa `appointments_domain_entries` e `appointments_domain_state`, com isolamento por `companyId`, revisão própria, importação inicial dos compromissos existentes durante a migração `021_appointments_domain.sql` e referências textuais opcionais a clientes e projetos para preservar dados durante a transição.

Tarefas usam `tasks_domain_entries` e `tasks_domain_state`, com isolamento por `companyId`, revisão própria, importação inicial das pendências existentes durante a migração `020_tasks_domain.sql` e referências textuais aos projetos para preservar dados durante a transição.

As rotas específicas já validam payloads, permissões e revisão de conflito conforme o domínio. Com `DATABASE_URL` configurada, os módulos operacionais listados acima leem e gravam diretamente nas tabelas PostgreSQL do NestJS, validam a sessão pelo endpoint interno e aceitam login por usuário e senha, OAuth e cadastro no próprio NestJS. O servidor raiz apenas encaminha essas rotas quando o NestJS está ativo e preserva o fallback sem PostgreSQL.

O levantamento técnico já permite criar e editar levantamentos, ambientes e pontos e excluir pontos e ambientes vazios diretamente no PostgreSQL, com revisão própria e isolamento por empresa. O envio ao orçamento também atualiza diretamente a oportunidade, o orçamento, os ambientes relacionados e o status do levantamento; a ponte legada fica como fallback sem PostgreSQL.

No detalhe de orçamento, a tela usa os recursos específicos `GET/POST/PATCH/DELETE /api/quotes/{id}/rooms` e `GET/POST/PATCH/DELETE /api/quotes/{id}/items`. A gravação coletiva antiga de ambientes permanece somente para compatibilidade.

Usuários da empresa usam `GET /api/company/users` e `POST/DELETE /api/company/users`; a criação de novos participantes continua no fluxo de convites.

A biblioteca de conhecimento usa isolamento por `companyId`, revisão própria e importação inicial dos artigos existentes durante a migração `011_knowledge_domain.sql`. Com PostgreSQL ativo, a sessão e as permissões são validadas pelo próprio NestJS; o contrato legado só é usado no fallback sem banco.

A biblioteca técnica usa isolamento por `companyId`, revisão própria e importação inicial dos fabricantes existentes durante a migração `013_product_library_domain.sql`. Com PostgreSQL ativo, a sessão e as permissões são validadas pelo próprio NestJS.

O catálogo de produtos e serviços usa a tabela `products_domain_entries`, mantém produtos e serviços na mesma coleção compatível com o legado e importa os registros durante a migração `014_products_domain.sql`. Com PostgreSQL ativo, a sessão e as permissões são validadas pelo próprio NestJS.

Clientes usam `clients_domain_entries`, `clients_domain_activities` e `clients_domain_state`, com isolamento por `companyId`, revisão própria e importação inicial durante as migrações `015_clients_domain.sql` e `034_client_activities_domain.sql`. O histórico de contatos possui rotas próprias por cliente; a exclusão mantém a mesma semântica do legado e não remove registros relacionados.

Avaliações de qualidade usam `quality_domain_evaluations` e `quality_domain_state`, com isolamento por `companyId`, revisão própria, validação das quatro notas e importação inicial durante a migração `016_quality_domain.sql`.

Chamados de pós-venda usam `support_tickets_domain_entries` e `support_tickets_domain_state`, com isolamento por `companyId`, revisão própria, validação de cliente/descrição e referências livres a cliente e equipamento durante a migração `017_support_tickets_domain.sql`.

Equipamentos usam `equipment_domain_entries`, `equipment_domain_history` e `equipment_domain_state`, com isolamento por `companyId`, revisão própria e importação inicial durante as migrações `018_equipment_domain.sql` e `036_equipment_history_domain.sql`. O histórico técnico possui rotas próprias por equipamento e preserva referências textuais durante a migração gradual.

Colaboradores usam `collaborators_domain_entries` e `collaborators_domain_state`, com isolamento por `companyId`, revisão própria e importação inicial durante a migração `019_collaborators_domain.sql`. Contas, convites e permissões continuam pertencendo aos recursos de identidade da empresa.

## Compatibilidade e cobertura restante

- manter `PUT /api/data` e as rotas coletivas antigas enquanto o shell legado continuar publicado; os módulos Next.js usam as rotas específicas do NestJS;
- manter os adaptadores `LEGACY_API_ORIGIN` como fallback explícito quando o PostgreSQL não estiver configurado; eles não são o caminho ativo da produção;
- ampliar os testes de integração e de interface autenticados por perfil usando contas de teste dedicadas. As suítes isoladas, de proteção anônima e de produção sem credenciais já estão aprovadas.

## Validação

Na raiz do projeto, execute `npm run check:all` para validar o backend legado, o frontend Next.js e o build do NestJS.

## Origem da API

Em desenvolvimento, o proxy usa `http://localhost:4173`. No ambiente online, configure `PROELIUM_API_ORIGIN` com a origem HTTPS do servidor antes de iniciar o Next.js.

Para ativar os recursos do NestJS, configure `PROELIUM_NEST_API_ORIGIN`; localmente o padrão é `http://localhost:4174`.
