# Banco de dados PostgreSQL

## Estado atual

O PostgreSQL é a fonte principal do estado operacional e dos usuários. A API pública permanece igual, portanto PWA, Android e Windows continuam usando `/api/data`, `/api/events` e as rotas de autenticação sem mudança de contrato.

Durante o período de conferência, cada gravação concluída no PostgreSQL também atualiza os arquivos JSON. Esses arquivos são apenas um espelho de contingência e não são a fonte principal quando `DATABASE_URL` está configurada.

## Estrutura inicial

- A migração `020_tasks_domain.sql` cria a persistência própria das tarefas operacionais, separada de `app_state`, e importa as pendências existentes por empresa.
- A migração `021_appointments_domain.sql` cria a persistência própria da agenda operacional, separada de `app_state`, e importa os compromissos existentes por empresa.
- A migração `022_service_orders_domain.sql` cria a persistência própria das ordens de serviço, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `023_installations_domain.sql` cria a persistência própria do cronograma de instalações, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `024_routines_domain.sql` cria a revisão própria das rotinas empresariais, usando a tabela `routines` já existente.
- A migração `025_project_checklists_domain.sql` cria a persistência própria dos checklists de projeto e importa os itens existentes por empresa.
- A migração `026_reports_domain.sql` cria a persistência própria de relatórios de serviço e entregas de projeto, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `027_projects_domain.sql` cria a persistência própria do cadastro de projetos, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `028_purchases_domain.sql` cria a persistência própria de compras e materiais, separada de `app_state`, e importa os itens existentes por empresa.

- `app_state`: versão atual do documento operacional e sua revisão;
- `app_state_revisions`: cópia imutável de cada revisão confirmada, com data e ator;
- `app_users`: usuários, funções, identidade Google, conta fundadora, perfil pessoal, portfólio e escopos de módulos;
- `companies`: empresas e a referência `founder_username` da conta que iniciou cada cadastro;
- `schema_migrations`: migrações já aplicadas.
- A migração `002_user_roles.sql` amplia os papéis de acesso sem invalidar contas legadas `operador`.
- A migração `011_knowledge_domain.sql` cria a persistência própria da biblioteca de conhecimento, separada de `app_state`, e importa os artigos existentes por empresa.
- A migração `012_survey_domain.sql` cria a persistência própria de levantamentos, pontos e ambientes, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `013_product_library_domain.sql` cria a persistência própria da biblioteca técnica de fabricantes, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `014_products_domain.sql` cria a persistência própria do catálogo de produtos e serviços, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `015_clients_domain.sql` cria a persistência própria de clientes, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `016_quality_domain.sql` cria a persistência própria de avaliações de qualidade, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `017_support_tickets_domain.sql` cria a persistência própria de chamados de pós-venda, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `018_equipment_domain.sql` cria a persistência própria do cadastro de equipamentos, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `019_collaborators_domain.sql` cria a persistência própria do cadastro profissional de colaboradores, separada de `app_state`, e importa os registros existentes por empresa.

Essa primeira etapa prioriza transações, histórico e recuperação sem exigir mudanças simultâneas em todas as telas. O modelo normalizado de `database/schema.sql` permanece como evolução posterior.

O domínio de conhecimento usa `knowledge_domain_articles` e `knowledge_domain_state`. A revisão do domínio é independente da revisão agregada, e os artigos são isolados por `company_id`; a sessão ainda é validada pela API de autenticação durante a migração gradual.

O domínio de levantamento usa `survey_domain_surveys`, `survey_domain_points`, `survey_domain_rooms` e `survey_domain_state`. O envio para orçamento permanece temporariamente híbrido porque ainda atualiza oportunidades, orçamentos e ambientes do agregado legado.

O domínio da biblioteca técnica usa `product_library_domain_entries` e `product_library_domain_state`. A revisão do domínio é independente da revisão agregada, e os fabricantes são isolados por `company_id`; a sessão e as permissões ainda são validadas pela API de autenticação durante a migração gradual.

O domínio de produtos usa `products_domain_entries` e `products_domain_state`. Produtos e serviços permanecem na mesma tabela, com `catalog_type` distinguindo os dois tipos; a revisão é independente da revisão agregada e os registros são isolados por `company_id`.

O domínio de clientes usa `clients_domain_entries` e `clients_domain_state`. A revisão é independente da revisão agregada, os clientes são isolados por `company_id` e a exclusão não remove entidades relacionadas de outros domínios.

O domínio de qualidade usa `quality_domain_evaluations` e `quality_domain_state`. As quatro notas são armazenadas com limites de 1 a 5, a revisão é independente da revisão agregada e os registros são isolados por `company_id`.

O domínio de chamados usa `support_tickets_domain_entries` e `support_tickets_domain_state`. Cliente e equipamento são referências textuais sem foreign keys para preservar o histórico durante a migração gradual; a revisão é independente e os registros são isolados por `company_id`.

O domínio de equipamentos usa `equipment_domain_entries` e `equipment_domain_state`. O cadastro não possui foreign keys para preservar referências históricas e o histórico técnico separado permanece em transição; a revisão é independente e os registros são isolados por `company_id`.

O domínio de colaboradores usa `collaborators_domain_entries` e `collaborators_domain_state`. Ele guarda o cadastro profissional operacional; contas de acesso, convites e permissões continuam nos domínios de identidade e empresa.

O domínio de tarefas usa `tasks_domain_entries` e `tasks_domain_state`. Projeto, responsável e demais vínculos permanecem como referências textuais durante a migração gradual; a revisão é independente e os registros são isolados por `company_id`.

O domínio de agenda usa `appointments_domain_entries` e `appointments_domain_state`. Cliente e projeto permanecem como referências textuais opcionais; a revisão é independente e os registros são isolados por `company_id`.

O domínio de ordens de serviço usa `service_orders_domain_entries` e `service_orders_domain_state`. Cliente, projeto e equipamento permanecem como referências textuais; a exclusão continua bloqueada quando há relatório vinculado, e a revisão é independente por empresa.

O domínio de instalações usa `installations_domain_entries` e `installations_domain_state`. Cliente e projeto permanecem como referências textuais, o progresso respeita o intervalo de 0 a 100 e a revisão é independente por empresa; checklists, entregas e relatórios continuam em transição.

O domínio de rotinas usa `routines` e `routines_domain_state`. A coleção de procedimentos é isolada por `company_id` e possui revisão própria.

O domínio de checklists usa `project_checklists_domain_entries` e `project_checklists_domain_state`. Os itens são isolados por `company_id`, aceitam revisão de conflito e o serviço de Relatórios consulta essa tabela para bloquear entregas incompletas; relatórios e entregas continuam híbridos enquanto seus registros principais não forem migrados.

O domínio de relatórios usa `reports_domain_service_entries`, `reports_domain_delivery_entries` e `reports_domain_state`. Relatórios atualizam diretamente ordens de serviço, compromissos e instalações quando os vínculos já foram migrados; a atualização de projetos e atividades permanece temporariamente na ponte legada.

O domínio de projetos usa `projects_domain_entries` e `projects_domain_state`. Cliente e demais vínculos permanecem como referências textuais; progresso e orçamento possuem limites no banco, e a revisão é independente por empresa.

O domínio de compras usa `purchases_domain_entries` e `purchases_domain_state`. Projeto, ambiente, produto e fornecedor permanecem como referências textuais; quantidade possui validação positiva, a revisão é independente e os registros são isolados por `company_id`.

A migração `010_account_profiles_founders.sql` adiciona a separação entre identidade pessoal e vínculo empresarial. Ao remover uma pessoa de uma empresa ou excluir uma empresa, a conta permanece em `app_users` como `account_type = 'portfolio'`; somente o vínculo, convites, rotinas e estado operacional da empresa são encerrados.

## Migrações

```bash
set -a
. /etc/proelium/database.env
set +a
cd /opt/proelium-operacional
npm run db:migrate
```

O deploy automático executa esse passo antes de reiniciar o serviço.
Cada arquivo e seu registro em `schema_migrations` são confirmados na mesma transação; uma falha deixa a migração pendente para uma nova tentativa segura.

O deploy também compila e instala o backend NestJS em `/opt/proelium-operacional/backend-nest`, mantendo o serviço `proelium-nest` na porta interna `4174`. A API NestJS usa o mesmo `DATABASE_URL` de `/etc/proelium/database.env` e valida as sessões pelo serviço legado local.

## Backup

- execução diária aproximada: 03:15 UTC;
- diretório: `/var/backups/proelium`;
- formato: dump customizado do PostgreSQL acompanhado de SHA-256;
- retenção local padrão: 30 dias;
- teste semanal: restauração em banco temporário e conferência das tabelas principais.

Comandos de acompanhamento:

```bash
systemctl status proelium-backup.timer
systemctl status proelium-restore-check.timer
journalctl -u proelium-backup.service --no-pager
journalctl -u proelium-restore-check.service --no-pager
```

## Contingência temporária

O arquivo `/var/lib/proelium-operacional/shared-data.before-postgresql.json` preserva o estado imediatamente anterior à importação. O espelho atualizado continua em `shared-data.json`. A desativação do PostgreSQL não deve ser feita durante gravações; exige janela controlada, parada do serviço e validação da revisão mais recente.

## Segurança

- PostgreSQL aceita a aplicação apenas pelo endereço local do VPS;
- credenciais ficam em `/etc/proelium/database.env`, fora do Git;
- o serviço web não publica arquivos de código, configuração, banco ou documentação;
- os hashes de senha existentes foram importados sem converter ou expor senhas;
- `DATABASE_URL`, dumps e dados operacionais não entram no GitHub.
