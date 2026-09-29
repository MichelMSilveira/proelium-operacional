# Mapa de módulos — NestJS e Next.js

O Proelium usa NestJS como API principal e Next.js como frontend principal. O servidor Node.js e o agregado legado permanecem somente como compatibilidade e fallback sem PostgreSQL. Esta página registra os domínios publicados e as exceções ainda mantidas por compatibilidade.

| Recurso | Serviço que atende hoje | Fonte de dados | Consumidores | Fallback | Teste de contrato/integração | Critério de corte | Reversão |
|---|---|---|---|---|---|---|---|
| Domínios operacionais | NestJS (`backend-nest/`) | PostgreSQL | Next.js, PWA, Android e Windows | Node.js somente sem PostgreSQL | `check:nest`, smoke e integração | rotas e persistência NestJS verificadas | fallback Node.js |
| Interface | Next.js (`frontend/`) | — | navegador e PWA | shell Node.js apenas para compatibilidade | `check:frontend` | build e rotas publicados | rollback do frontend |
| Compatibilidade | Node.js (`server.js`, `app.js`) | agregado JSON quando sem banco | fallback local | — | `check` | somente suporte ao modo legado | manter isolado |

## Critério de manutenção

1. Registrar novos domínios no NestJS e suas rotas no frontend Next.js.
2. Manter o fallback Node.js isolado e documentado quando houver necessidade de compatibilidade.
3. Testar sucesso, erros, acesso, isolamento de dados e concorrência conforme o risco do recurso.
4. Conferir health check, proxy publicado e smoke test após a entrega.

A validação usa `npm run check`, `npm run check:frontend`, `npm run check:nest` ou `npm run check:all`. Consulte [Arquitetura atual](ARCHITECTURE-CURRENT.md) e [Processo de entrega](RELEASE-PROCESS.md).
