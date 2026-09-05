# Frontend Next.js

Primeira fatia da migração gradual para React, TypeScript e Next.js.

Este frontend ainda não substitui o app legado. A API continua sendo a do servidor raiz (`http://localhost:4173`) e os módulos são migrados por fatias validadas.

## Rotas em transição

As rotas atuais consultam a API existente e estão inicialmente em modo somente leitura:

`/clients`, `/projects`, `/commercial`, `/quotes`, `/finance`, `/bi`, `/operations`, `/agenda`, `/products`, `/quality`, `/knowledge`, `/equipment`, `/purchases`, `/survey`, `/reports`, `/routines`, `/installations`, `/collaborators`, `/settings`, `/users` e `/invites`.

Clientes, ConfiguraÃ§Ãµes e Convites jÃ¡ possuem fluxos de escrita validados; as demais rotas permanecem inicialmente em modo somente leitura.

OrÃ§amentos jÃ¡ permite criar rascunhos com tÃ­tulo, cliente opcional e validade. Itens, revisÃµes e aprovaÃ§Ã£o permanecem na prÃ³xima etapa.

O shell de autenticação, sessão, logout e navegação também está em Next.js. Formulários de edição, permissões de interface, sincronização em tempo real e substituição do legado permanecem como próximas etapas.

## Validação

Na raiz do projeto, execute `npm run check:all` para validar o backend legado e o frontend Next.js juntos.

## Origem da API

Em desenvolvimento, o proxy usa `http://localhost:4173`. No ambiente online, configure `PROELIUM_API_ORIGIN` com a origem HTTPS do servidor antes de iniciar o Next.js.
