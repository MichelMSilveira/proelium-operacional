# Arquitetura atual — leitura do código versionado

**Atualizado em:** 29/09/2026. Esta página descreve a topologia atual do repositório e separa o caminho principal das camadas de compatibilidade. Para evoluções futuras, veja [ARCHITECTURE.md](ARCHITECTURE.md).

## Componentes

| Componente | Localização | Papel |
|---|---|---|
| API NestJS | `backend-nest/` | API principal, autenticação e domínios operacionais |
| Frontend Next.js | `frontend/` | Interface principal, navegação e consumo da API NestJS |
| PostgreSQL | `database/` e configuração de ambiente | Persistência principal dos domínios migrados |
| Proxy | `deploy/` | Distribuição das rotas públicas entre os serviços |
| Compatibilidade Node.js | `server.js`, `app.js` | Fallback local sem PostgreSQL e compatibilidade histórica |

PWA e clientes Android/Windows consomem a interface Next.js compartilhada. A lista versionada de rotas está em [frontend/README.md](../frontend/README.md), os rewrites em [frontend/next.config.ts](../frontend/next.config.ts) e o proxy em [deploy/](../deploy/). O Node.js permanece apenas como fallback de compatibilidade e não deve ser tratado como arquitetura principal.

## Regras de leitura

- O backend Nest usa hoje o prefixo `/api`; a base `/api/v1` de [API.md](API.md) é uma proposta, não uma confirmação de implantação.
- O frontend possui rewrites para os recursos NestJS; o fallback genérico para o servidor Node.js existe apenas para compatibilidade e modo sem banco.
- A existência de código em um serviço não substitui o health check e a conferência do proxy publicado.
- Mudanças nos contratos compartilhados exigem aceite das plataformas afetadas e plano de reversão.

Build verde confirma compilação; o ambiente publicado ainda deve ser validado por health check e smoke test após cada entrega.
