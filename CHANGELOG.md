# Histórico de versões

## 0.4.1 — 2026-08-15

- logo oficial fornecida da EMS Studio aplicada à abertura, ao cabeçalho e ao modo privacidade;
- marca EMS Studio ampliada com escala própria para desktop e celular;
- cabeçalho desktop recebeu mais espaço para a marca EMS Studio, com data deslocada à esquerda;
- logo EMS Studio ampliada novamente nas versões desktop e celular;
- logo do cabeçalho móvel recebeu ampliação adicional;
- cabeçalho móvel reorganizado com data e relógio mais baixos para dar maior presença à marca;
- controle de intensidade da arte no celular reorganizado em duas linhas para evitar sobreposição;
- marca EMS Studio no cabeçalho móvel movida para baixo e à esquerda, com ampliação adicional;
- desfazer protegido por 15 segundos após exclusões de cliente/produto e ajustes de agenda ou execução; a restauração exige confirmação para evitar acionamento acidental;
- exclusão de compromisso disponível diretamente na consulta rápida da agenda, com confirmação e opção protegida de desfazer;
- ação de exclusão reforçada também na tela de edição do compromisso, para acesso rápido e explícito;
- ações comerciais exibidas na agenda agora podem ser removidas da agenda sem apagar a oportunidade do CRM;
- botão Remover incluído diretamente na consulta rápida para ações comerciais agendadas;
- catálogo comercial ampliado com referências de preço e indicação explícita de que valores, disponibilidade, impostos e margem devem ser validados antes do orçamento;
- filtros combináveis no catálogo por categoria, marca e modalidade;
- fluxo comercial conectado: oportunidade pode iniciar um orçamento por ambientes; ao aprovar, o aplicativo cria ou vincula o cliente e gera o projeto com custo e valor calculados pelos itens;
- agenda vinculável a cliente e projeto; ao excluir um cliente, compromissos ligados a ele ou aos seus projetos também são removidos;
- separação esclarecida entre catálogo comercial e equipamentos/ativos físicos com número de série, local e status;
- base de conhecimento ampliada para elétrica, segurança, informática, redes, cabeamento, áudio e instalação;
- política editorial da base de conhecimento: somente procedimentos Proelium, registros futuros do N.E.M.O. ou fontes técnicas, científicas e normativas verificáveis; sem propaganda de marcas;
- trilha visual de aprendizagem em quatro níveis: Fundamentos, Operacional, Avançado e Específico;
- Carta de Conduta Proelium posicionada como primeira leitura da base, com princípios de relacionamento, segurança, privacidade, registro, acabamento e cooperação;
- modo privacidade reorganizado: EMS Studio ao centro e Proelium no canto inferior esquerdo;
- corrigido o cadastro compartilhado de Waldemir.

> Os dados vivos do catálogo, colaboradores e demais cadastros ficam no servidor compartilhado (`data/shared-data.json`) e não são enviados ao Git por conterem informações operacionais. O Git registra o código, a documentação e a estrutura padrão.

## 0.4.0 — 2026-08-15

- marca EMS Studio ampliada e adaptada para telas grandes e celulares;
- data e temas visuais por estação, configuráveis por aparelho;
- menu móvel fecha ao tocar fora dele;
- atalho de leitura com ampliação de letras e alto contraste, salvo individualmente;
- novo terminal de BI de desempenho: projetos tratados como ativos, com filtros, ranking, margem, resultado e score;
- análise detalhada por projeto com gráficos de linha, indicadores, custos, receita, resultado e movimentações demonstrativas;
- avaliações relacionais de qualidade e compromisso, pela equipe e pelo cliente;
- quadro de colaboradores e parceiros com função, especialidade, disponibilidade e forma de atuação;
- dados e gráficos demonstrativos identificados como demo, preparados para substituição gradual pelos registros reais.

## 0.3.0 — 2026-08-14

- sincronização automática entre aparelhos por eventos do servidor;
- revisão central dos dados e proteção contra sobrescrita concorrente;
- verificação periódica como contingência para conexões móveis;
- atualização do cache do aplicativo para a versão 3;
- compatibilidade temporária com o servidor antigo usando a data de atualização e conferência a cada 5 segundos.
- reiniciador seguro para substituir a instância antiga que estiver ocupando a porta 4173.
- publicação automatizada com validação, confirmação, commit e envio ao GitHub.
- encerramento formal da Etapa 0 e plano da primeira rodada dos Blocos 1 e 2.
- primeiro fluxo funcional do Bloco 2: oportunidades comerciais e conversão em cliente.
- agenda operacional interna integrada a tarefas, instalações e próximas ações comerciais.
- visualização mensal da agenda, com cartões de compromissos por dia e navegação entre meses.
- cadastro direto de compromissos pela agenda, com data atual sugerida automaticamente.
- interação por dia: ao tocar no calendário, abre a lista completa e permite criar um compromisso naquela data.
- consulta rápida em janela compacta ao tocar em um dia da agenda.
- ajuste rápido de compromissos próprios da agenda, sem alterar por engano tarefas ou instalações vinculadas.
- segurar um compromisso na consulta rápida abre seu ajuste; corrigidos os botões Cancelar e X dos formulários.
- o aplicativo volta ao último módulo aberto após atualizar a página, em cada aparelho.
- consulta rápida em dois níveis: toque no item para ver detalhes e editar tarefas, compromissos, instalações ou ações comerciais.
- setas de dia anterior e próximo dia dentro da consulta rápida da agenda.
- botão voltar do navegador retorna primeiro à Visão geral e pede confirmação antes de sair do aplicativo.
- reforçada a etapa de confirmação após chegar à Visão geral, evitando saída no primeiro toque de voltar.
- proteção de saída adaptada para navegadores móveis que não disparam o histórico normal ao usar Voltar.
- Voltar na Visão geral agora mantém o aplicativo aberto; a saída é feita fechando o navegador ou aplicativo.
- tela inicial com a identidade EMS Studio ao abrir ou atualizar o aplicativo.

## 0.2.0 — 2026-08-14

### Adicionado

- CRM Cliente 360° com histórico;
- fluxo Contatos → Orçamentos → Projetos → Acompanhamento;
- etapas Projeto técnico → Cabeamento → Instalação;
- catálogo UniFi, Scenario Embrace, Denon, STAGE, Morel e B&W;
- orçamento por cômodos com custo, venda e margem;
- painel de Business Intelligence;
- exclusão de clientes e produtos;
- PWA instalável;
- acesso privado por Tailscale;
- armazenamento experimental compartilhado no PC servidor;
- documentação operacional e fluxo Git.

### Limitações conhecidas

- sem autenticação dentro do app;
- sem mesclagem automática quando duas pessoas alteram a mesma versão;
- sem banco de dados transacional;
- sem backup automático.
