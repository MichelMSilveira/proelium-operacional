# Banco de dados PostgreSQL

Com PostgreSQL ativo, o gateway publico valida a sessao no NestJS para as APIs protegidas antes de encaminhar a requisicao ao dominio correspondente. Isso mantem o mesmo cookie de autenticacao entre o shell legado, o Next.js e os recursos compartilhados; sem banco, o fallback legado continua ativo.

O parser JSON do NestJS aceita corpos de ate 6 MB, o mesmo limite configurado no gateway publico, para comportar o agregado compartilhado e o catalogo tecnico inicial sem resposta `413 Payload Too Large`.

Na validação pós-migração, os usuários importados precisam continuar presentes no PostgreSQL; contas criadas posteriormente são permitidas e não causam falso positivo por diferença de quantidade.

O perfil da empresa (`/api/company/profile`) agora consulta e atualiza `companies` diretamente pelo NestJS quando o PostgreSQL está ativo, mantendo a validação do administrador e o fallback legado sem banco.

A ponte legada de rotinas (`/api/company/routines`) agora consulta e grava `routines` diretamente pelo NestJS quando o PostgreSQL está ativo, com bloqueio transacional por empresa e fallback legado sem banco.

O ciclo de convites (`/api/company/invites`) agora lista, cria e revoga `company_invites` diretamente pelo NestJS quando o PostgreSQL está ativo; o token continua armazenado apenas como hash e a aceitação posterior permanece compatível.

O perfil pessoal (`/api/account/profile`) agora consulta e atualiza `app_users` diretamente pelo NestJS quando o PostgreSQL está ativo; `portfolio`, e-mail e vínculo empresarial permanecem preservados.

A administração de empresas (`/api/admin/companies`) agora lista, atualiza e exclui registros diretamente pelo NestJS quando o PostgreSQL está ativo; exclusões transferem vínculos para o portfólio pessoal e removem o estado operacional da empresa.

O aceite de convite para uma sessão já autenticada (`/api/auth/consume-invite`) agora valida o token hash e atualiza o vínculo em `app_users` diretamente pelo NestJS quando o PostgreSQL está ativo; os fluxos OAuth continuam compatíveis com a ponte legada.

O cadastro local de empresas (`/api/auth/register-company`) agora grava `companies` e o usuário fundador em `app_users` na mesma transação quando o PostgreSQL está ativo; sem banco, o cadastro continua usando o fallback legado.

O onboarding Google de novas empresas (`/api/auth/register-google-company`) também grava empresa e fundador diretamente no PostgreSQL quando o banco está ativo; o callback OAuth e a identificação temporária continuam compatíveis com a ponte legada.

O aceite de convite para novos usuários Google (`/api/auth/join-google-company`) agora atualiza ou cria `app_users` e marca `company_invites.used_at` na mesma transação quando o PostgreSQL está ativo; a ponte legada permanece disponível sem banco.

Com PostgreSQL ativo, o NestJS também inicia e conclui o OAuth Google, validando o `state`, consultando `app_users` e emitindo a sessão; contas novas continuam seguindo para onboarding ou aceite de convite.

O proxy público preserva os redirecionamentos e cookies desse fluxo, permitindo que o navegador conclua o retorno do Google no mesmo domínio oficial.

A leitura e a gravação compatíveis do agregado (`GET/PUT /api/data`) agora consultam e atualizam `app_state` diretamente pelo NestJS quando o PostgreSQL está ativo; a gravação usa revisão, lock transacional, auditoria de revisão, permissões e validação do fluxo comercial. Sem banco, o fallback legado permanece.

A reconciliação administrativa de etapas comerciais usa o mesmo `app_state` transacional pelo NestJS quando o banco está ativo, preservando auditoria e controle de concorrência; sem banco, o endpoint continua no servidor legado.

Com PostgreSQL ativo, o servidor pÃºblico encaminha `auth/me`, `auth/login` e `auth/logout` ao NestJS; sem banco, o fallback continua no servidor legado.

O gerenciamento de usuários globais (`/api/auth/users`) também grava diretamente em `app_users` quando o banco está ativo; perfis vinculados a empresas continuam sendo administrados pela rota própria da empresa.

A rota `/api/company/users` agora também consulta e atualiza `app_users` diretamente quando o PostgreSQL está ativo; ao desligar um colaborador, o vínculo empresarial é removido e o histórico da empresa fica no portfólio pessoal.

Com `DATABASE_URL` configurada, o utilitario `auth-admin.js` grava e atualiza credenciais diretamente em `app_users`, a fonte consultada pelo login de producao. Sem PostgreSQL, o fallback continua usando `data/users.json`.

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
- A migração `029_finance_domain.sql` cria a persistência própria de lançamentos e contas financeiras, separada de `app_state`, e importa os registros existentes por empresa.
- A migração `030_execution_domain.sql` cria a persistência própria dos lançamentos de execução, separada de `app_state`, e importa os custos de campo existentes por empresa.
- A migração `031_diagram_domain.sql` cria a persistência própria das conexões técnicas e registros auxiliares do diagrama, separada de `app_state`, e importa o estado existente por empresa.
- A migração `032_opportunities_domain.sql` cria a persistência própria das oportunidades comerciais, separada de `app_state`, e importa o cadastro existente por empresa.
- A migração `033_quotes_domain.sql` cria a persistência própria de orçamentos, ambientes e itens, separada de `app_state`, e importa o estado existente por empresa.
- A migração `034_client_activities_domain.sql` cria a persistência própria do histórico de contatos dos clientes, vinculada ao domínio de Clientes, e importa as atividades existentes por empresa.
- A migração `035_quotes_auxiliary_domain.sql` cria a persistência própria de pacotes comerciais e solicitações de cotação, vinculada ao domínio de Orçamentos, e importa os registros existentes por empresa.
- A migração `036_equipment_history_domain.sql` cria a persistência própria do histórico técnico de equipamentos, vinculada ao domínio de Equipamentos, e importa os registros existentes por empresa.

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

O domínio de levantamento usa `survey_domain_surveys`, `survey_domain_points`, `survey_domain_rooms` e `survey_domain_state`. O envio para orçamento atualiza diretamente os domínios de oportunidades e orçamentos, criando ambientes faltantes e preservando as revisões de cada domínio; o agregado legado permanece apenas como fallback sem PostgreSQL.

O domínio da biblioteca técnica usa `product_library_domain_entries` e `product_library_domain_state`. A revisão do domínio é independente da revisão agregada, e os fabricantes são isolados por `company_id`; a sessão e as permissões ainda são validadas pela API de autenticação durante a migração gradual.

O domínio de produtos usa `products_domain_entries` e `products_domain_state`. Produtos e serviços permanecem na mesma tabela, com `catalog_type` distinguindo os dois tipos; a revisão é independente da revisão agregada e os registros são isolados por `company_id`.

O domínio de clientes usa `clients_domain_entries`, `clients_domain_activities` e `clients_domain_state`. Clientes e histórico de contatos são isolados por `company_id`, compartilham a revisão do CRM e a exclusão não remove entidades relacionadas de outros domínios.

O domínio de qualidade usa `quality_domain_evaluations` e `quality_domain_state`. As quatro notas são armazenadas com limites de 1 a 5, a revisão é independente da revisão agregada e os registros são isolados por `company_id`.

O domínio de chamados usa `support_tickets_domain_entries` e `support_tickets_domain_state`. Cliente e equipamento são referências textuais sem foreign keys para preservar o histórico durante a migração gradual; a revisão é independente e os registros são isolados por `company_id`.

O domínio de equipamentos usa `equipment_domain_entries`, `equipment_domain_history` e `equipment_domain_state`. O cadastro e o histórico técnico não possuem foreign keys para preservar referências históricas; ambos compartilham a revisão independente do domínio e são isolados por `company_id`.

O domínio de colaboradores usa `collaborators_domain_entries` e `collaborators_domain_state`. Ele guarda o cadastro profissional operacional; contas de acesso, convites e permissões continuam nos domínios de identidade e empresa.

O domínio de tarefas usa `tasks_domain_entries` e `tasks_domain_state`. Projeto, responsável e demais vínculos permanecem como referências textuais durante a migração gradual; a revisão é independente e os registros são isolados por `company_id`.

O domínio de agenda usa `appointments_domain_entries` e `appointments_domain_state`. Cliente e projeto permanecem como referências textuais opcionais; a revisão é independente e os registros são isolados por `company_id`.

O domínio de ordens de serviço usa `service_orders_domain_entries` e `service_orders_domain_state`. Cliente, projeto e equipamento permanecem como referências textuais; a exclusão continua bloqueada quando há relatório vinculado, e a revisão é independente por empresa.

O domínio de instalações usa `installations_domain_entries` e `installations_domain_state`. Cliente e projeto permanecem como referências textuais, o progresso respeita o intervalo de 0 a 100 e a revisão é independente por empresa; checklists, entregas e relatórios continuam em transição.

O domínio de rotinas usa `routines` e `routines_domain_state`. A coleção de procedimentos é isolada por `company_id` e possui revisão própria.

O domínio de checklists usa `project_checklists_domain_entries` e `project_checklists_domain_state`. Os itens são isolados por `company_id`, aceitam revisão de conflito e o serviço de Relatórios consulta essa tabela para bloquear entregas incompletas antes da gravação direta da entrega.

O domínio de relatórios usa `reports_domain_service_entries`, `reports_domain_delivery_entries` e `reports_domain_state`. Relatórios e entregas atualizam diretamente os domínios operacionais já migrados, incluindo ordens de serviço, compromissos, instalações, projetos e atividades do CRM; o agregado legado permanece apenas como fallback quando o PostgreSQL não está configurado.

O domínio de projetos usa `projects_domain_entries` e `projects_domain_state`. Cliente e demais vínculos permanecem como referências textuais; progresso e orçamento possuem limites no banco, e a revisão é independente por empresa.

O domínio de compras usa `purchases_domain_entries` e `purchases_domain_state`. Projeto, ambiente, produto e fornecedor permanecem como referências textuais; quantidade possui validação positiva, a revisão é independente e os registros são isolados por `company_id`.

O domínio financeiro usa `finance_domain_entries`, `finance_domain_accounts` e `finance_domain_state`. Lançamentos e contas são isolados por `company_id`, a revisão é independente e cliente, projeto e conta permanecem como referências textuais durante a migração gradual; custos criados pela Execução são sincronizados nessa coleção quando o PostgreSQL está ativo.

O domínio de execução usa `execution_domain_entries` e `execution_domain_state`. Projeto e vínculo financeiro permanecem como referências textuais, a revisão é independente por empresa e cada gravação sincroniza o custo correspondente no domínio financeiro.

O domínio de diagrama usa `diagram_domain_connections`, `diagram_domain_aux_records` e `diagram_domain_state`. As conexões, edições e sobrescritas são isoladas por `company_id`, a revisão é independente e o projeto permanece como referência textual durante a migração gradual.

O domínio de oportunidades usa `opportunities_domain_entries` e `opportunities_domain_state`. O cadastro é isolado por `company_id`, a revisão é independente e a validação das transições do fluxo comercial consulta diretamente os domínios migrados; o envio do levantamento e a conversão posterior também atualizam o PostgreSQL diretamente.

O domínio de orçamentos usa `quotes_domain_entries`, `quotes_domain_rooms`, `quotes_domain_packages`, `quotes_domain_procurement_requests` e `quotes_domain_state`. Propostas, pacotes e fila de cotação são isolados por `company_id` e compartilham a revisão comercial; os itens dos ambientes e dos pacotes permanecem em JSONB para manter o cálculo atual; aprovação e conversão posterior atualizam diretamente clientes, projetos e oportunidades. O fallback legado só é usado sem PostgreSQL.

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

O deploy também compila e instala o backend NestJS em `/opt/proelium-operacional/backend-nest`, mantendo o serviço `proelium-nest` na porta interna `4174`. Com PostgreSQL ativo, o servidor público encaminha `auth/me` e `auth/login` ao NestJS; sem banco, o fallback continua no servidor legado.

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
