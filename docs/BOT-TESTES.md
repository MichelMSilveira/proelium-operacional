# Bot de testes do Proelium Operacional

## Objetivo

O bot é um projeto interno de validação automatizada. Ele não faz parte da experiência dos usuários do Proelium Operacional e não deve aparecer na interface publicada.

Ele verifica se o sistema continua funcionando depois de alterações no código, incluindo shell público, autenticação, API, permissões e fluxos operacionais.

## Organização

- `bot-testes/scripts/smoke-bot.js`: valida a disponibilidade básica do servidor, shell, manifesto, service worker e proteção da API.
- `bot-testes/scripts/real-use-bot.js`: percorre o app publicado em modo somente leitura.
- `bot-testes/scripts/functional-test-bot.js`: simula um fluxo completo em armazenamento temporário de teste.
- `bot-testes/scripts/ui-use-bot.js`: percorre a interface com navegador automatizado quando há credenciais de teste.
- `bot-testes/test/`: testes automatizados específicos do bot.
- `reports/`: relatórios gerados pelas execuções.

## Comandos

```text
npm run check
npm run test:bot
npm run test:real-use
npm run test:functional
npm run test:ui-use
```

Os testes funcionais usam dados temporários e não devem acessar o banco ou os arquivos reais da operação. Credenciais de teste devem ser fornecidas por variáveis de ambiente e nunca gravadas no Git.

## Limites

O bot não substitui homologação com usuários reais, revisão de segurança, conferência financeira ou aprovação da direção. Ele é uma camada automatizada de detecção de regressões.

Alterações no bot devem ser documentadas aqui e não devem alterar o comportamento do produto, exceto quando a alteração estiver explicitamente relacionada à validação de um novo requisito.
