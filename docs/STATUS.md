# STATUS — Proelium Operacional

## Estado atual

Produto operacional com arquitetura principal consolidada em Next.js, NestJS e PostgreSQL. O shell Node.js e o contrato agregado permanecem somente para compatibilidade e fallback local sem banco. Consulte [Arquitetura atual](ARCHITECTURE-CURRENT.md) e o [mapa de módulos](MIGRATION-NEST.md) para distinguir o caminho principal das exceções de compatibilidade.

## Validação conhecida

- `npm run check`: sintaxe e suíte automatizada já existente.
- `npm run check:frontend`: tipos e build Next.js.
- `npm run check:nest`: build NestJS e testes isolados de contrato, permissões e isolamento do módulo de clientes.
- CI do PR: build do frontend, build/testes NestJS, migrações e integração PostgreSQL conforme o workflow.
- `Validar-Local.ps1`: verificações locais e bots pertinentes.
- O workflow de deploy compila serviços e executa smoke após publicar; isso não substitui revisão prévia.
- `main` protegida: PR obrigatório, `validate` verde, conversas resolvidas, sem force push/exclusão e sem bypass de administrador. Aceite humano continua obrigatório no processo.

## Próximos passos

1. Manter a proteção da branch e exigir o aceite explícito do responsável antes de cada integração.
2. Manter testes de contrato e integração dos domínios Nest conforme o risco de cada alteração.
3. Manter o mapa de módulos e as instruções de operação atualizados junto com cada mudança.

`PROJECT.md` define produto e limites; `CHANGELOG.md` guarda histórico. Este arquivo é apenas o estado curto para retomada.
