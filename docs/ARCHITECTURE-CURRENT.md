# Arquitetura atual — leitura do código versionado

**Atualizado em:** 28/09/2026. Esta página descreve a topologia encontrada no repositório, não certifica o estado do ambiente publicado. Para decisões futuras, veja [ARCHITECTURE.md](ARCHITECTURE.md); para um corte por recurso, veja [MIGRATION-NEST.md](MIGRATION-NEST.md).

## Componentes

| Componente | Localização | Papel |
|---|---|---|
| Aplicação legada | `server.js`, `app.js` | Shell principal e compatibilidade durante a migração |
| API NestJS | `backend-nest/` | Recursos migrados por domínio |
| Frontend Next.js | `frontend/` | Interface dos módulos e roteamento de API |
| PostgreSQL | `database/` e configuração de ambiente | Persistência principal dos domínios migrados |
| Proxy | `deploy/` | Distribuição das rotas públicas entre os serviços |

PWA e clientes Android/Windows consomem a interface compartilhada. A lista versionada de rotas Next está em [frontend/README.md](../frontend/README.md), os rewrites em [frontend/next.config.ts](../frontend/next.config.ts) e o exemplo de proxy em [deploy/](../deploy/). Confirmar o comportamento do ambiente antes de declarar uma rota migrada ou desligar o legado.

## Regras de leitura

- O backend Nest usa hoje o prefixo `/api`; a base `/api/v1` de [API.md](API.md) é uma proposta, não uma confirmação de implantação.
- O frontend possui rewrites específicos para recursos migrados e um fallback genérico para o servidor legado. A existência de código em um serviço não prova que o proxy público envia tráfego a ele.
- Distinguir estado implementado, comportamento observado no ambiente e arquitetura desejada. Em divergência, registrar a evidência e validar antes de publicar.
- Mudanças nos contratos compartilhados exigem aceite das plataformas afetadas e plano de reversão.

Esta documentação foi elaborada sem acesso ao ambiente publicado ou ao relatório externo de auditoria. Build verde confirma compilação, não equivalência funcional.
