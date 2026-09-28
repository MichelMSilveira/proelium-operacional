# Regras de trabalho — Proelium Operacional

Este repositório é um produto com dados e publicação em VPS. Leia `PROJECT.md`, `docs/STATUS.md` e a [arquitetura atual](docs/ARCHITECTURE-CURRENT.md) antes de alterar fluxos centrais. As regras detalhadas do Continue em `.continue/rules/projeto.md` usam a mesma política de autorização: **editar não autoriza publicar**.

## Topologia e impacto

- `server.js`/`app.js`: shell e compatibilidade legados (4173).
- `backend-nest/`: API NestJS (4174), com módulos de domínio e PostgreSQL.
- `frontend/`: interface Next.js (4300), com rewrites para Nest e fallback legado.
- PWA, Android e Windows consomem a interface publicada; mudança web não exige novo APK/EXE. Alterações em `android/` ou `desktop/` exigem revisão e pacote nativo próprios.
- Confirme o dono da rota e dos dados em `docs/MIGRATION-NEST.md` antes de modificar um recurso migrado. Não usar `docs/ARCHITECTURE.md` ou `docs/API.md` como prova de implantação atual: são propostas.

## Fluxo de alteração

1. Definir escopo, risco, plataformas afetadas e critério de aceite; ler somente os módulos relevantes.
2. Trabalhar em branch separada, com mudança reversível. Para shell web alterado, atualizar o identificador `CACHE` de `sw.js`.
3. Atualizar `CHANGELOG.md` e a documentação afetada quando houver mudança funcional ou de operação.
4. Instalar as dependências dos três projetos e executar `npm run check:all`, os bots pertinentes e `git diff --check`. `Validar-Local.ps1` reúne as verificações locais; registrar o que não pôde ser executado. Build não substitui teste de autenticação, permissão e isolamento.
5. Revisar o diff e abrir PR somente quando o usuário autorizar commit/push da branch. Não fazer push direto na `main`, nem usar deploy como teste.
6. Merge na `main` aciona publicação automática no VPS. Exige aprovação do responsável pela publicação, CI verde e verificação de banco/backup/reversão quando aplicável; acompanhar o deploy e o smoke de produção.

Não versionar `data/`, credenciais, backups, tokens, chaves ou artefatos privados. Alterações em banco, autenticação, permissões, arquitetura central e produção exigem autorização explícita e revisão proporcional ao risco. Se não houver cobertura ou aprovação suficiente, deixar a mudança na branch e relatar o bloqueio.
