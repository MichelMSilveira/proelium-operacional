# Bot de testes do Proelium Operacional

## Objetivo

O bot é um projeto interno de validação automatizada. Ele não faz parte da experiência dos usuários do Proelium Operacional e não deve aparecer na interface publicada.

Ele verifica se o sistema continua funcionando depois de alterações no código, incluindo shell público, autenticação, API, permissões e fluxos operacionais.

## Organização

- `bot-testes/scripts/smoke-bot.js`: valida a disponibilidade básica do servidor, shell, manifesto, service worker e proteção da API.
- `bot-testes/scripts/real-use-bot.js`: percorre o app publicado em modo somente leitura.
- `bot-testes/scripts/functional-test-bot.js`: simula um fluxo completo em armazenamento temporário de teste.
- `bot-testes/scripts/ui-use-bot.js`: percorre a interface com navegador automatizado quando há credenciais de teste.
- `bot-testes/scripts/ui-commercial-flow-bot.js`: cria uma empresa temporária vazia, autentica uma conta fundadora e usa a interface real para cadastrar colaborador, oportunidade, levantamento, quantitativo, orçamento, revisão e aprovação.
- `bot-testes/test/`: testes automatizados específicos do bot.
- `reports/`: relatórios gerados pelas execuções.

## Comandos

```text
npm run check
npm run test:bot
npm run test:real-use
npm run test:functional
npm run test:ui-use
npm run test:ui-flow
```

Os testes funcionais usam dados temporários e não devem acessar o banco ou os arquivos reais da operação. Credenciais de teste devem ser fornecidas por variáveis de ambiente e nunca gravadas no Git.

O fluxo funcional também explora a matriz de contas: fundador recebe os módulos pertinentes ao perfil da empresa; colaborador convidado recebe somente os módulos do cargo; mestre acessa a administração da plataforma sem dados operacionais; suporte consulta a central sem empresa; e perfil pessoal conserva somente identidade e portfólio.

Na área comercial, o bot percorre dois ciclos completos: uma oportunidade passa pelas etapas até o orçamento, preserva a primeira versão enviada, cria uma revisão com desconto e quantidade ajustados e aprova a revisão convertendo-a em cliente e projeto; outra proposta é recusada e encerrada como perdida sem criar cliente ou projeto. Os totais bruto, desconto, líquido, custo, margem e vínculos são conferidos antes e depois da gravação.

A interface comercial apresenta o mesmo caminho operacional: cada cartão aponta para iniciar ou continuar o levantamento, abrir o orçamento, acompanhar uma proposta, conferir a aprovação ou abrir o cliente. A criação manual de cliente não substitui a aprovação do orçamento.

O teste de uso real não chama funções internas de criação ou alteração do `app.js`, não usa o botão “Carregar exemplos” e não pré-carrega registros comerciais. Ele apenas prepara a autenticação e lê a empresa vazia em uma pasta temporária, preenche os campos visíveis, clica em salvar em cada etapa e depois consulta a API somente para conferir o que foi persistido. A pasta temporária é removida ao final.

Na sessão de demonstração, o botão “Carregar exemplos” cria cinco ciclos marcados como `DEMO`: oportunidade aberta, levantamento em andamento, proposta enviada, venda aprovada com cliente/projeto e proposta recusada sem conversão. A carga usa um marcador idempotente, preserva os dados anteriores e não roda automaticamente. A rotina antiga de carga automática foi desativada para que uma empresa nova comece vazia.

## Limites

O bot não substitui homologação com usuários reais, revisão de segurança, conferência financeira ou aprovação da direção. Ele é uma camada automatizada de detecção de regressões.

Alterações no bot devem ser documentadas aqui e não devem alterar o comportamento do produto, exceto quando a alteração estiver explicitamente relacionada à validação de um novo requisito.
