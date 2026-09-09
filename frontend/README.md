# Frontend Next.js

Frontend em React, TypeScript e Next.js, migrado gradualmente a partir do app legado.

O shell de autenticação, sessão, logout e navegação já está em Next.js. As telas são migradas por módulos, mantendo compatibilidade com o servidor raiz durante a transição.

## Rotas

O frontend possui as rotas `/clients`, `/projects`, `/processes`, `/commercial`, `/quotes`, `/finance`, `/bi`, `/operations`, `/agenda`, `/products`, `/product-library`, `/product-connections`, `/quality`, `/knowledge`, `/equipment`, `/purchases`, `/survey`, `/reports`, `/routines`, `/installations`, `/collaborators`, `/settings`, `/users` e `/invites`.

As telas que já possuem operações de negócio usam endpoints específicos do NestJS, incluindo clientes, projetos, oportunidades, produtos, serviços, orçamentos, ambientes, itens, financeiro, compras, colaboradores, agenda, tarefas, ordens de serviço, relatórios, instalações, qualidade, conhecimento, equipamentos, rotinas, biblioteca técnica, conexões, chamados, execução, levantamento técnico e usuários da empresa.

Indicadores e o resumo inicial são consultas compostas por recursos separados. Processos é um fluxo estático e não depende de gravação.

## Estado da migração

As rotas específicas já validam payloads, permissões e revisão de conflito conforme o domínio. A persistência, entretanto, ainda é encaminhada por vários serviços NestJS ao contrato agregado legado `/api/data`, usando `LEGACY_API_ORIGIN`. Essa ponte é temporária e permite migrar a interface sem interromper o app em produção.

O levantamento técnico já permite criar e editar levantamentos, ambientes e pontos, excluir pontos e ambientes vazios e enviar levantamentos validados ao orçamento. Esses fluxos ainda persistem no agregado legado.

No detalhe de orçamento, a tela usa os recursos específicos `GET/POST/PATCH/DELETE /api/quotes/{id}/rooms` e `GET/POST/PATCH/DELETE /api/quotes/{id}/items`. A gravação coletiva antiga de ambientes permanece somente para compatibilidade.

Usuários da empresa usam `GET /api/company/users` e `POST/DELETE /api/company/users`; a criação de novos participantes continua no fluxo de convites.

## Próximas etapas

- migrar a persistência dos módulos do agregado legado para tabelas e serviços PostgreSQL do NestJS;
- iniciar pelos módulos com contrato mais isolado e preservar leitura, revisão e permissões durante a transição;
- retirar gradualmente `PUT /api/data` e as rotas coletivas antigas depois que nenhum consumidor depender delas;
- adicionar testes de integração autenticados por perfil e concluir a substituição visual do legado.

## Validação

Na raiz do projeto, execute `npm run check:all` para validar o backend legado, o frontend Next.js e o build do NestJS.

## Origem da API

Em desenvolvimento, o proxy usa `http://localhost:4173`. No ambiente online, configure `PROELIUM_API_ORIGIN` com a origem HTTPS do servidor antes de iniciar o Next.js.

Para ativar os recursos do NestJS, configure `PROELIUM_NEST_API_ORIGIN`; localmente o padrão é `http://localhost:4174`.
