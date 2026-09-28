# STATUS — Proelium Operacional

## Estado atual

Produto operacional em migração incremental. O shell legado, o frontend Next.js e o backend NestJS convivem; a persistência principal dos domínios migrados usa PostgreSQL quando configurado. Consulte [Arquitetura atual](ARCHITECTURE-CURRENT.md) e [Controle de migração](MIGRATION-NEST.md) antes de tratar um recurso como concluído.

## Validação conhecida

- `npm run check`: sintaxe e suíte automatizada já existente.
- `npm run check:frontend`: tipos e build Next.js.
- `npm run check:nest`: build NestJS e testes isolados de contrato, permissões e isolamento do módulo de clientes.
- CI do PR: migrações em PostgreSQL descartável e integração real do módulo de clientes; os demais domínios Nest ainda não têm cobertura equivalente.
- `Validar-Local.ps1`: verificações locais e bots pertinentes.
- O workflow de deploy compila serviços e executa smoke após publicar; isso não substitui revisão prévia.

## Próximos passos

1. Confirmar proteção da branch de publicação, CI de PR e aprovação humana antes de integrar.
2. Adicionar testes de contrato e integração dos domínios Nest conforme o risco de cada corte.
3. Manter o mapa de migração e as instruções de operação atualizados junto com cada mudança.

`PROJECT.md` define produto e limites; `CHANGELOG.md` guarda histórico. Este arquivo é apenas o estado curto para retomada.
