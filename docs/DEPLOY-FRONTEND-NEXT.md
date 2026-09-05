# Deploy do frontend Next.js

## Estado atual

O app legado continua atendendo a porta `4173`. O frontend Next.js é validado no CI, mas ainda não é publicado no VPS.

## Estratégia de transição

1. Gerar o build com `npm --prefix frontend run build`.
2. Publicar `frontend/.next/standalone` e os arquivos estáticos correspondentes em um diretório versionado do VPS.
3. Executar o Next.js como serviço separado, em uma porta interna que não seja `4173`.
4. Configurar o proxy para encaminhar apenas as rotas migradas ao Next.js e manter as demais no app legado.
5. Definir `PROELIUM_API_ORIGIN` apontando para a origem HTTPS da API legada.
6. Validar health check, autenticação e uma rota migrada antes de ampliar o encaminhamento.

## Critérios de rollback

Se o health check ou a autenticação falhar, remover o encaminhamento das rotas Next.js e manter o serviço legado ativo. O build anterior deve permanecer disponível para retorno rápido.

## Pendências de infraestrutura

- nome e arquivo do serviço do Next.js;
- porta interna reservada;
- configuração do proxy reverso;
- segredo/variável `PROELIUM_API_ORIGIN` no VPS;
- health check público e procedimento de rollback.
