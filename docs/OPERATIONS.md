# Operação do ambiente de testes

## Cronograma inteligente e configurável

No módulo **Cronograma e acompanhamento**, o fundador ou administrador da empresa pode usar **Configurar fases** para editar os nomes e as cores das fases e adicionar novas fases. A configuração é compartilhada somente com a empresa autenticada; usuários de outras empresas não recebem esses dados.

Ao abrir ou ajustar a previsão de um projeto, **Aplicar sugestão** calcula uma referência usando os ambientes e itens do orçamento vinculado e os pontos do levantamento quando disponíveis. A sugestão é apenas um ponto de partida: dias, equipe e horas continuam editáveis e o orçamento aprovado não é alterado.

## Componentes

| Componente | Responsabilidade |
|---|---|
| VS Code | editar os arquivos do projeto |
| Git | registrar versões do código e da documentação |
| GitHub | repositório remoto futuro |
| `server.js` | servir o app e armazenar dados compartilhados |
| Tailscale Serve | fornecer acesso HTTPS privado |
| PostgreSQL | manter os dados operacionais, usuários e histórico de revisões |
| Espelho JSON | contingência temporária durante a conferência da migração |

## Inicialização diária

1. Ligar o PC servidor e conectar o Tailscale.
2. Executar `Reiniciar-App.ps1` e manter a janela aberta.
3. Verificar `http://localhost:4173`.
4. Executar `tailscale serve status` e confirmar proxy para a porta 4173.
5. Testar o endereço HTTPS em um segundo dispositivo.

## Encerramento

Fechar a janela do servidor interrompe o acesso. Antes de desligar o PC, aguarde o término de qualquer cadastro e faça backup quando houver alterações relevantes.

## Backup

O PostgreSQL gera backup diário em `/var/backups/proelium` e executa uma restauração de teste semanal. O espelho JSON continua fora do Git, mas não substitui o dump do banco. Consulte [DATABASE.md](DATABASE.md).

## Recuperação

A recuperação normal usa um dump PostgreSQL validado. A volta temporária ao espelho JSON exige janela controlada e conferência da revisão; nunca altere o arquivo manualmente enquanto o servidor estiver rodando.

Ao abrir um espelho JSON legado, o app completa em memória as coleções operacionais que não existiam nas versões antigas. Esse ajuste preserva o conteúdo salvo e evita que módulos como Colaboradores, Financeiro e BI quebrem por uma lista ausente; ele não substitui a migração para PostgreSQL.

## Diagnóstico rápido

- `localhost:4173` não abre: servidor local não está rodando.

- Se o login Google retornar `Validação Google expirada ou inválida`, volte para a página inicial e inicie o login novamente. O estado OAuth é temporário e assinado; ele também fica em cookie por cinco minutos para sobreviver a um reinício do servidor local durante a autorização.
- Android abre e iPhone não: conta, VPN ou rede Tailscale do iPhone.
- endereço `.ts.net` aponta para 5500: Tailscale ainda está ligado ao Live Server.
- exclusão não aparece em outro dispositivo: abra `https://homehell.tail99a9b2.ts.net/api/data`. A resposta deve ser JSON; `Cannot GET /api/data` indica que o Tailscale aponta para o servidor errado.
- inclusões, edições e exclusões são enviadas automaticamente aos demais aparelhos. Se a conexão cair, o aplicativo tenta reconectar e também confere o servidor a cada 5 segundos.
- o primeiro quadro autenticado já deve abrir com o menu completo; se aparecer uma versão antiga por um instante, faça uma atualização forçada (`Ctrl+F5`) para substituir o cache local.
- depois de enviar a ficha Google, a tela deve entrar no app imediatamente; os dados compartilhados podem aparecer logo depois. Se a ficha for reenviada, o servidor informa que a sessão Google expirou ou que o cadastro já existe.
- se duas pessoas alterarem a partir da mesma versão, a segunda gravação é bloqueada; a tela recebe os dados atuais e pede que a última ação seja repetida.
- `/api/events` retorna `404`: existe uma instância antiga do servidor na porta 4173; execute `Reiniciar-App.ps1`.

## Catálogo por empresa

Ao entrar em uma empresa pelo navegador, o app inicia a tela operacional sem os dados de demonstração enquanto busca o ambiente compartilhado; assim os indicadores não exibem valores provisórios. Dados reais aparecem depois da sincronização e de uma inclusão feita pelo botão ou pelo usuário.

Em `Produtos`, o botão `Exportar tabela` baixa um CSV com o catálogo da empresa, incluindo SKU, marca, fornecedor, modalidade, custo, preço e status. A exportação é feita no navegador e não consulta nem inclui dados de outras empresas.

O catálogo aparece no menu como `Produtos` e `Serviços`, dentro do fluxo comercial. Produtos representam equipamentos e materiais; serviços representam mão de obra, visitas, diárias e atividades precificadas. A `Biblioteca técnica`, dentro de `Projetos 360°`, concentra fabricantes, modelos, portas e regras de conexão usados por produtos e pacotes comerciais.

No detalhe de um orçamento, `Adicionar produto` e `Adicionar serviço` usam o mesmo cálculo de custo, venda, desconto e margem. Se o serviço ainda não existir no catálogo, `Adicionar serviço` permite cadastrá-lo e já incluí-lo no orçamento.

Após a aprovação, o `Projeto 360°` possui uma previsão operacional independente do orçamento: informe início, diárias, tamanho da equipe, horas por dia e custo diário por profissional. O sistema calcula custo de mão de obra, custo total previsto, prazo final e margem operacional. O valor comercial aprovado permanece preservado; os lançamentos reais em `Execução e mão de obra` permitem comparar previsto e realizado.

Em `Cronograma e acompanhamento`, selecione um projeto para visualizar os dias previstos em uma linha contínua. Cada quadrado representa um dia e as cores diferenciam projeto técnico, cabeamento/infraestrutura, instalação e testes/entrega. A distribuição é uma previsão inicial e pode ser revisada pelo botão `Ajustar previsão` do projeto.

## Projeto 360°

Os atalhos da Visão geral para projetos em andamento abrem o Projeto 360° selecionado. A tela mantém o orçamento aprovado, cronograma, execução e pós-venda vinculados; o botão de orçamento dentro do projeto abre a proposta detalhada correspondente.

No levantamento tecnico, o painel de dimensionamento apresenta primeiro os requisitos calculados, depois os produtos compativeis por requisito. Os produtos ficam organizados nas areas Rede, Automacao, Audio e Video e Cameras; alternativas adicionais do catalogo ficam recolhidas em cada card. Precos e inclusao no orcamento continuam sendo tratados no fluxo comercial.

Depois da aprovação, o orçamento permanece como histórico comercial e o projeto passa a concentrar o ciclo operacional. A tela `Projetos 360°` reúne o resumo do orçamento aprovado, cronograma, tarefas, compras, execução, entrega, relatórios e pós-venda, mantendo os vínculos por `projectId` e `quoteId`. Os menus `Processos`, `Acompanhamento` e `Operação` foram reorganizados em áreas mais claras; o acesso global de pós-venda continua disponível para filas entre projetos.

## Bot de teste operacional

Para avaliar o app publicado sem criar ou alterar registros, rode `npm run test:real-use`. Esse modo somente leitura confere o shell, os módulos essenciais, a saúde do servidor, a proteção da API e, quando informadas, a sessão e a leitura sincronizada.

Para percorrer as telas como um usuário, defina `PROELIUM_TEST_USER` e `PROELIUM_TEST_PASSWORD` e rode `npm run test:ui-use`. O navegador automatizado abre o app, faz login, clica nos módulos visíveis e confirma que cada conteúdo renderiza, sem salvar registros.

Com o app em execução, rode `npm run test:bot`. O bot faz verificações somente de leitura em `http://127.0.0.1:4173`: saúde e horário do servidor, backend de armazenamento, interface principal, manifesto PWA, service worker e proteção da API.

Para testar outro endereço, acrescente a URL: `npm run test:bot -- https://endereco-do-app`. Para também validar login, sessão e leitura sincronizada, defina `PROELIUM_TEST_USER` e `PROELIUM_TEST_PASSWORD` antes de executar. As credenciais não devem ser gravadas em arquivos nem incluídas no Git.

O deploy da `main` envia o bot ao VPS e o executa depois da reinicialização do serviço. Qualquer verificação reprovada encerra o workflow com erro e impede que uma implantação defeituosa seja declarada concluída.

Registro de contingência em 2026-09-11: a execução do `Atualizar-VPS.ps1` não concluiu e o status do GitHub Actions não ficou observável. A entrega `523219e` foi aplicada manualmente por SSH no `server.js` e a entrega do NestJS foi aplicada no `dist/main.js`; ambos os serviços foram reiniciados e validados com health check 200.

Para executar o cenário funcional completo, use `npm run test:functional`. Ele abre outro servidor em uma porta aleatória, força armazenamento JSON em uma pasta temporária e simula contato, proposta, venda, projeto, operação, pós-venda, financeiro e permissões. Ao terminar, encerra o servidor, apaga a pasta temporária e grava `reports/test-bot-latest.md` com as correções recomendadas.

Para inspecionar manualmente a interface já preenchida pelo bot, use `npm run test:functional -- --keep-open --no-report`. O endereço temporário aparece no terminal; pressione `Ctrl+C` para destruir o ambiente. O servidor recusa `PROELIUM_TEST_DATA_DIR` fora de `NODE_ENV=test`, evitando uso acidental dessa configuração na operação real.

O relatório validado desta entrega está em [TEST-BOT-REPORT.md](TEST-BOT-REPORT.md).
Em produção, configure `SESSION_SECRET` no ambiente do serviço com um valor aleatório de pelo menos 32 caracteres. O servidor recusa iniciar com o segredo padrão de desenvolvimento; nunca registre esse valor em arquivos versionados.
# Atualização comercial — 04/09/2026

O funil não oferece mais avanço manual de etapa nem carga de dados demonstrativos. O orçamento deve ser iniciado a partir de um levantamento validado, com pelo menos um ponto ou quantitativo registrado. A carga demonstrativa permanece disponível apenas nos cenários automatizados de teste isolado.

Atividades comerciais são registradas pelo cartão da oportunidade em “Nova atividade”. Elas usam a agenda operacional, preservando responsável, data, horário e observação; a oportunidade mantém a contagem e a próxima data registrada.
O escopo de dados das atividades comerciais acompanha a oportunidade e permanece isolado por empresa, inclusive para usuários com perfil comercial limitado.
Cadastros de clientes devem usar documento, e-mail e telefone únicos dentro da empresa. Em caso de duplicidade, o sistema bloqueia a gravação ou a aprovação e orienta a reutilizar o cliente existente.
O funil comercial exibe indicadores calculados da própria empresa: valor em aberto, valor ganho, conversão entre decisões, ticket médio das oportunidades ganhas e ações vencidas.
Uma proposta só pode ser aprovada quando o total líquido de venda supera o custo previsto. Descontos são aceitos de 0% a 100%; a margem mínima configurável da empresa permanece como próxima evolução.
Na análise da proposta, “Imprimir / salvar PDF” usa a impressão do navegador para gerar o arquivo, enquanto “Aceite do cliente” aprova a proposta e cria os vínculos operacionais existentes. “Registrar recusa” guarda motivo e data no orçamento.
Oportunidades representam prospecção e contatos em desenvolvimento. A tela não exibe mais a análise de orçamentos por ambiente; propostas devem ser acompanhadas em Orçamentos, e clientes convertidos em Clientes.
Na visão de prospecção, os cartões priorizam relacionamento, próxima interação e situação do contato. O levantamento permanece como ponte técnica quando necessário, mas valores, margem, métricas financeiras e análise de orçamento não fazem parte dessa tela.
Ao aprovar uma oportunidade, ela deixa de aparecer no mapa ativo e o cliente permanece preservado. Novos interesses do mesmo cliente ou projeto devem ser registrados como novas oportunidades independentes.
O teste `npm run test:ui-flow` cria 30 oportunidades por interação real com a interface antes de validar o ciclo principal; a base temporária começa vazia e não usa mutações diretas de oportunidades, levantamentos, clientes ou projetos.
## Levantamento inicial por necessidades

Na prévia de Automação, pontos de iluminação são consolidados por modo: relé ou dimmer. O sistema mostra o controlador e a quantidade de circuitos/canais, consulta módulos compatíveis no catálogo e só aplica os itens selecionados depois da confirmação da solução técnica.

Pontos de som ambiente podem ser mono ou estéreo. Pontos de cinema aceitam configurações como 5.1, 5.1.2, 7.1 e 7.1.4; a prévia mostra canais, caixas principais, caixas de altura, subwoofer e alerta de amplificação externa quando necessário. Após a confirmação, as referências escolhidas são aplicadas ao orçamento com as quantidades dimensionadas.

Na prévia da rede, o rack mostra unidades ocupadas e reserva técnica. Organizadores horizontais de cabos são calculados por blocos de até 24 portas e entram na infraestrutura do orçamento somente após a confirmação do produto compatível.

O dimensionamento de rede exibe um nobreak senoidal com a carga PoE conhecida convertida em potência e VA mínimos, além de autonomia de 10 minutos. Quando a carga não foi informada, a potência fica pendente de validação. A prévia também registra circuito dedicado, aterramento e DPS; somente o nobreak confirmado no catálogo entra automaticamente no orçamento.

Quando a solução técnica é confirmada, o envio ao orçamento usa os produtos selecionados como referências dos itens precificados pelo catálogo. Sem confirmação, o fluxo mantém o mapeamento comercial legado; em ambos os casos o pré-projeto continua vinculado ao levantamento.

Para cada requisito compatível, o sistema confirma uma única referência. As demais opções continuam visíveis como alternativas e não entram juntas no orçamento.

Pontos de Wi-Fi geram uma necessidade separada de access points. Após a confirmação, o produto escolhido é incluído no ambiente correspondente com a quantidade levantada; o switch continua sendo dimensionado separadamente.

Quando o consumo PoE foi informado e o catálogo possui orçamento de potência, switches abaixo do mínimo não aparecem como compatíveis. Se o catálogo não informar a potência, a referência deve ser validada tecnicamente antes da proposta.

Para uma rede dimensionada, o levantamento também exibe patch panel com a capacidade do switch e rack técnico mínimo de 6U. Esses itens só entram na infraestrutura do orçamento quando uma referência compatível é confirmada.

O levantamento começa pelos ambientes e pelas necessidades do cliente nos quatro temas: Automação, Áudio e vídeo, Conectividade e Câmera e Acessos. O checklist é expansível por tema; cada item selecionado pode receber quantidade e uma nota comercial/técnica. A tela apresenta uma prévia somente leitura de Dimensionamento Técnico: primeiro transforma os pontos em requisitos genéricos de Rede, como portas com reserva e potência PoE, sem selecionar marca, produto ou preço; em seguida, a camada de Produtos Compatíveis consulta o catálogo e mostra referências que atendem à capacidade e ao PoE, também sem precificar. O usuário pode confirmar as referências compatíveis, que ficam registradas como solução técnica no levantamento; essa confirmação ainda não cria itens nem preços no orçamento. Ao enviar um levantamento validado ao orçamento, o sistema cria a proposta em elaboração, um pré-projeto técnico vinculado e sugestões de itens do catálogo por ambiente e na infraestrutura técnica. Também dimensiona módulos de iluminação, switches e cabos pelas quantidades informadas e recalcula o valor da proposta. As sugestões e o pré-projeto ficam identificados pelo levantamento para permitir revisão e reenvio sem duplicação; quando não houver produto compatível, a pendência deve ser resolvida manualmente no orçamento. Na aprovação, o pré-projeto é reutilizado para formar o projeto definitivo. Alterações futuras no catálogo devem preservar versões já usadas em levantamentos e propostas.
