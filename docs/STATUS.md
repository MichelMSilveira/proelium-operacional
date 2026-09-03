# STATUS — Proelium Operacional

## Estado atual
Projeto operacional ativo. O bot funcional executa um cenário completo em servidor JSON temporário, sem acessar PostgreSQL ou os arquivos reais, e produz relatório de correções.

## Estrutura de contexto
- `AGENTS.md`: regras de entrega e plataformas;
- `.continue/rules/projeto.md`: regras detalhadas do projeto;
- `PROJECT.md`: identidade, fonte de verdade e limites;
- este arquivo: ponto principal de retomada.

## Validação atual

- `npm run check`: valida sintaxe, armazenamento, bot funcional, isolamento empresa/perfil fundador e codificação;
- `npm run test:functional`: simula 33 domínios e relações do app;
- interface: 26 módulos renderizados e fluxo contato → proposta → venda → projeto conferido no navegador isolado;
- relatório: `docs/TEST-BOT-REPORT.md`;
- identidade: a primeira conta do cadastro é fundadora; perfis desligados permanecem com portfólio pessoal sem dados privados da empresa;
- bloqueios: nenhum.

## Regra
Nao duplicar aqui historico extenso. O `CHANGELOG.md` permanece como historico; `STATUS.md` deve representar somente o estado atual necessario para retomada rapida.
