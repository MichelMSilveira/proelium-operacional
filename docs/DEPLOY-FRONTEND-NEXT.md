# Deploy do frontend Next.js

## Estado atual

O app legado continua atendendo a porta `4173` para a raiz e o contrato de compatibilidade. O frontend Next.js é executado na porta `4300` e as rotas dos módulos publicados são encaminhadas pelo Nginx.

## Estratégia de transição

1. Gerar o build com `npm --prefix frontend run build`.
2. Publicar `frontend/.next/standalone` e os arquivos estáticos correspondentes em um diretório versionado do VPS.
3. Executar o Next.js como serviço separado na porta `4300`.
4. Instalar `deploy/proelium-next-proxy.example.conf` em `/etc/nginx/snippets/proelium-next-locations.conf` e recarregar o Nginx.
5. Encaminhar para o Next.js todas as rotas de módulos construídas e suas APIs específicas; manter no servidor raiz health check, OAuth, SSE e o contrato legado.
6. Validar health check, autenticação, matriz de rotas, recursos estáticos e APIs específicas antes de ampliar o shell principal.

## Critérios de rollback

Se o health check ou a autenticação falhar, remover o encaminhamento das rotas Next.js e manter o serviço legado ativo. O build anterior deve permanecer disponível para retorno rápido.

## Infraestrutura publicada

- serviço `proelium-next.service` na porta `4300`;
- proxy reverso versionado em `deploy/proelium-next-proxy.example.conf`;
- health check público e teste operacional executados no deploy;
- rollback: remover ou restaurar o snippet do Next.js e recarregar o Nginx, mantendo o app legado na porta `4173`.
