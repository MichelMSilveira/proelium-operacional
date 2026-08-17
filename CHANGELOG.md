# Histórico de versões

## Em desenvolvimento

- AtualizaÃ§Ã£o no celular: o salvamento prÃ©vio da atualizaÃ§Ã£o agora possui limite de espera, evitando que a tela fique presa quando a conexÃ£o estiver instÃ¡vel.

- Levantamento tÃ©cnico: corrigido o botÃ£o de novo registro da tela para abrir o formulÃ¡rio de novo levantamento tÃ©cnico.

- PresenÃ§a por dispositivo: a lista de participantes identifica se cada usuÃ¡rio estÃ¡ usando Android, iPhone/iPad, Windows, macOS, Linux ou navegador.

- Atualização em tempo real: o app verifica novas versões enquanto permanece aberto, ao voltar ao foco e periodicamente, garantindo que a tela dedicada de atualização seja exibida sem exigir reinstalação.

- Colaboração e auxílio: os botões de presença passaram a usar delegação global de clique, garantindo resposta também no WebView Android e em telas móveis.

- Sincronização: corrigida a validação de gravações por perfil para comparar corretamente o estado dentro do envelope PostgreSQL; usuários autorizados voltam a sincronizar alterações normalmente.

- Salvamento automático: o app verifica alterações de estado a cada poucos segundos e sincroniza automaticamente com o PostgreSQL, além dos salvamentos imediatos das ações existentes.

- Relatórios: criada a aba de Emissão de relatórios, com emissão por obra, histórico de serviços e impressão da lista consolidada.

- Auxílio operacional: participantes podem marcar disponibilidade, pedir auxílio e notificar automaticamente quem está online e disponível para atender.

- Presença e colaboração: o app mostra participantes online em tempo real, registra entrada/saída pelo canal compartilhado e adiciona o botão “Quero colaborar”, que envia o pedido aos administradores com notificação do navegador quando autorizada.

- Atualizações seguras: antes de aplicar uma nova versão no cliente, o app aguarda sincronizações em andamento e salva o estado compartilhado; depois aplica a atualização do shell.

- Atualizações do app: quando uma nova versão web é detectada, o usuário recebe uma tela dedicada com a ação explícita de atualizar; a sessão e os dados locais são preservados durante o recarregamento.

- BI Desempenho: os gráficos ganharam uma leitura central de trajetória da carteira/obra e um gráfico de volume por ativo, mantendo o detalhamento de margem, custo, prazo e score.

- BI Desempenho: adicionada uma faixa de cotações dos ativos em movimento, mostrando cada obra como um ativo da carteira e sua variação de execução contra a etapa esperada.

- Sessão no Android: a identificação do usuário logado voltou a aparecer no cabeçalho móvel, com truncamento seguro para nomes longos.

- Permissões: usuários agora podem usar os perfis Administrador, Comercial, Operação, Financeiro e Leitura. O menu e a navegação respeitam o perfil, o cadastro de usuários permite escolher o papel e o servidor bloqueia gravações fora do domínio autorizado; `operador` permanece compatível como Operação.

- Identidade visual: o cliente Windows passa a usar o `icon.svg` oficial na instalação e no executável; o APK Android foi versionado para distribuir a mesma marca vetorial já configurada no launcher.
- Dados: PostgreSQL passou a armazenar transacionalmente o estado operacional, usuários e histórico de revisões, mantendo um espelho JSON temporário para contingência e serializando inclusive a primeira gravação concorrente.
- Segurança e operação: adicionados backup diário com retenção, verificação semanal de restauração, endpoint de saúde do armazenamento e bloqueio de arquivos internos no servidor web.
- Implantação: a verificação automática do VPS agora aguarda a inicialização do serviço e repete o teste HTTP antes de declarar falha.
- Visão Geral: indicadores, projetos em andamento e alertas passaram a funcionar como atalhos para os respectivos módulos e detalhes, com resposta visual, suporte a teclado e adaptação móvel.
- Entrega contínua: formalizado o fluxo de documentação, validação, Git, GitHub e implantação no VPS. O app web permanece como fonte única para PWA, Android e Windows; pacotes nativos só ganham nova versão quando seus próprios arquivos mudam.
- Entrega: atualizada a identificação do service worker para que aparelhos presos em uma cópia antiga do menu recebam o shell atual, sem limpar os dados locais do aplicativo.
- Menu: criada a entrada **Conexões de produtos**, ao lado de Produtos e Serviços. Ela abre diretamente a ficha de entradas, saídas, portas, cabos e modelo de cada equipamento, sem exigir procura dentro do catálogo.
- Catálogo: o botão **Consultar** agora aparece ao lado de cada produto e abre a **Ficha técnica de conexões**, onde ficam entradas, saídas, portas e cabo. A versão do aplicativo foi atualizada para os aparelhos receberem esse ajuste.
- Produtos e Serviços recebeu consulta técnica fixa no topo: selecionar um produto mostra identidade, modelo, função, cabo, portas de entrada e saída; há atalho para editar o mapeamento. No celular, a lista passa a exibir todos os campos como cartões verticais, sem esconder colunas.
- Diagrama técnico ganhou a leitura “Diagrama por portas”: por camada (Rede, Automação, Áudio ou Vídeo), cada cabo mostra os dois equipamentos, respectivos modelos, porta de saída, tipo de cabo e porta de entrada. A tela apenas interpreta conexões existentes; ela não cria cabos sem confirmação.
- Produtos e serviços agora possuem identidade técnica por modelo: marca, modelo, SKU e listas de portas de entrada e saída. Essas portas aparecem na Bancada de Ligação e passam a alimentar as próximas conexões do diagrama.
- Diagrama técnico: a primeira leitura da camada de Rede passou a mostrar a cadeia Internet → roteador → switch e, abaixo, uma linha por porta de saída com cabo e destino cadastrados. A mudança é apenas visual e preserva o orçamento, a auditoria e as conexões técnicas existentes.
- Diagrama técnico recebeu a Bancada de Ligação: equipamentos do projeto aparecem juntos com entradas e saídas; selecionar uma saída e depois uma entrada cria o cabo, registra auditoria e atualiza o fluxograma.
- Saídas do switch agora mostram as duas pontas da ligação: miniatura do switch, número e tipo de porta, cabo, miniatura do aparelho de destino, nome/modelo e entrada correspondente.
- No Diagrama técnico, “Conexões do sistema” passa a aparecer logo após o título, antes de guias, mapa de portas e demais painéis.
- Mapa de portas foi refinado para uma leitura por cabo: `PORTA N → Cat6/PoE → equipamento`, repetida para cada saída do switch conforme o escopo do projeto.
- Camada de Rede ganhou um mapa de portas do switch: uplink, chassi com portas numeradas, ocupação visual e um cabo identificado para cada equipamento conectado.
- Ao recarregar, o aplicativo restaura a página de trabalho, os registros em foco e a posição de rolagem daquele aparelho; voltar para Visão geral continua sendo a escolha explícita de início.
- A visualização detalhada do diagrama foi restaurada: registro de ligações, detalhes de entrada/saída e fluxograma continuam visíveis; o mapa de portas do switch atua apenas como complemento da rede.
- Diagrama técnico ganhou a Mesa de Ligação: cada cabo pode ser criado ou ajustado por campos claros de origem, saída, cabo, entrada e destino, sem depender de arrastar setas no desenho.
- O fluxograma passa a refletir as ligações registradas na mesa; ajustes manuais ficam marcados para confirmação em campo e entram na auditoria.
- Diagrama técnico passou a oferecer leitura por camadas: Rede, Automação, Áudio e Vídeo.
- Cada camada mantém o mesmo cenário e destaca somente seus equipamentos e ligações, sem duplicar informações do orçamento ou da operação.
- Diagrama e Registro de ligações do cenário agora usam a mesma lista de conexões como fonte de verdade.
- Padrão da rede refinado para: link externo / internet → Dream Machine (roteador) → Switch UniFi Pro Max 24 PoE → access points e demais dispositivos de rede da casa.
- Mapa de rede agora consolida duplicações comerciais de roteador e switch: o desenho mostra apenas o núcleo físico principal e evita loops falsos entre access points e switches.
- Seletor de camadas reposicionado imediatamente acima do diagrama de conexões para manter a leitura técnica agrupada.
- Camada de Rede ganhou leitura vertical: origem, roteador, switch e ramificações para os equipamentos.
- Diagrama técnico recebeu visual minimalista: linhas em destaque, símbolo técnico compacto e legenda curta do modelo em cada equipamento.
- Rede teve a hierarquia visual fixada em roteador → switch, com setas de maior contraste; automação passou a seguir rede → controladora (RJ‑45) → NTL → keypads/comandos.
- Consoles são classificados como vídeo: recebem a ligação de rede do switch e podem enviar sinal HDMI 2.1 ao receiver. O código Embrace `EB-PS5` permanece classificado como hub de automação, sem confusão com PlayStation 5.
- Corrigida a definição do `EB-PS5`: ele é o hub Embrace-Net que recebe o sinal da NTL e distribui cordões de comunicação para keypads e módulos; a controladora permanece ligada à rede por RJ‑45.
- Diagrama técnico agora desdobra quantidades inteiras em equipamentos individuais e mostra uma linha rotulada para cada cabo/ligação.
- Ligações individuais foram formalizadas como registros de cabo: cada uma guarda origem, porta de saída, tipo de cabo, porta de entrada, destino e situação.
- Registro de ligações do cenário passou a separar cabos por Rede, Automação, Áudio e Vídeo.
- Produtos e Serviços ganhou Consulta técnica: a ficha mostra papel, entrada, saída, cabo, destinos e capacidade usados pelo diagrama.
- Hub EB-PS5 passou a distribuir aparelhos individualmente pelos cinco cordões de comunicação; após o quinto aparelho, o cenário identifica a derivação no respectivo cordão para conferência em campo.
- Topologia do EB-PS5 refinada: o Cordão 1 fica reservado ao chicote do quadro, agrupando os módulos; keypads e demais aparelhos ocupam os Cordões 2 a 5 restantes.
- Movimentação entre ambientes agora exige quantidade inteira para aparelhos por unidade, como TVs, evitando bloqueio causado pela antiga precisão decimal.
- Diagrama técnico passou a usar linhas de fluxograma com saída e entrada laterais ou verticais conforme a posição dos equipamentos, evitando zigue-zagues e facilitando a leitura organizada do cenário.
- Diagrama técnico ganhou leitura compacta: ícones menores, sem caixas pesadas, núcleo técnico em ordem de fluxo e aparelhos agrupados por disciplina.
- Fluxograma técnico agora permite arrastar a ponta de uma seta sobre outro equipamento. Após confirmação, o Registro de ligações é atualizado como ajuste manual pendente de validação em campo.
- Corrigida a camada de interação do fluxograma: os controles circulares das setas ficam acima dos ícones e identificam corretamente o equipamento de destino ao soltar.
- Nós do fluxograma agora exibem bolinhas de portas: entradas, saídas usadas versus capacidade conhecida e o tipo de conexão associado. Esses dados passam a sustentar sugestões automáticas e futuras validações de compatibilidade.
- Cadastro de Produtos e Serviços agora inclui mapa técnico obrigatório de conferência: papel no sistema, entradas, saídas, interface, capacidade e observações. O perfil acompanha o item até o orçamento, operação e diagrama.
- Diagrama técnico passou a abrir com um Guia rápido de ligação: Rede, Automação, Áudio e Vídeo. O cenário aparece antes do registro detalhado de cabos, e cada guia destaca sua camada com um toque.
- Camada de Rede recebeu símbolos técnicos diretos para roteador, switch, access point e ponto de rede; bolinhas de portas agora usam a nomenclatura explícita IN e OUT para facilitar o apontamento de entradas e saídas.

## 0.4.1 — 2026-08-15

- Padrão de cenário: criado o modelo reutilizável de ligação Proelium. Perfis técnicos descrevem entrada, saída, meio de conexão e destino esperado para roteador, switch, access point, NTL, keypad, receiver e caixas de som; o projeto passa a guardar um registro de ligações propostas e suas pendências.

- Diagrama técnico: relações lógicas padronizadas incluídas no mapa — roteador para switch, switch para access points, receiver para caixas de som e NTL para keypads. Quando a origem não está cadastrada, o sistema exibe a ligação como pendência pontilhada.

- Diagrama técnico: o mapa de conexões foi compactado e os nós passaram a ser agrupados por sistema — Rede, Automação, Áudio, Vídeo e Outros — com sinalização cromática discreta para facilitar a leitura da lógica.

- Diagrama técnico: incluído o mapa de conexões com linhas entre origem/rack, centrais, equipamentos e pontos técnicos. Linhas contínuas representam origem cadastrada; linhas pontilhadas marcam conexões lógicas que ainda exigem conferência de ficha técnica ou visita.

- Base técnica: cada produto passa a ter uma ficha padronizada de entrada, saída/função, cabo/interface e capacidade. O catálogo expõe a tabela de definição técnica e o diagrama mostra pendências detectáveis — capacidade excedida, ponto sem origem e infraestrutura mínima ausente — sem assumir como confirmado o que ainda precisa ser validado pela ficha técnica.

- Diagrama técnico: a leitura do projeto foi convertida para um fluxograma visual com origem/rack, equipamentos centrais, distribuição e ambientes atendidos. Pontos técnicos vinculados passam a aparecer no ambiente com sua origem de capacidade.

- Regras de infraestrutura: formalizado o catálogo de dependências técnicas. Keypads sugerem Cat6, access points/pontos de rede sugerem Cat6 para dados/PoE e caixas de som agora sugerem cabo de alto-falante, sempre com metragem editável e confirmação do orçamentista.

- Rateio comercial: itens de rede, automação e infraestrutura deixam de ser pré-selecionados para distribuição. Eles entram integralmente no ambiente físico; o rateio é opcional e só ocorre quando o vendedor o ativa como decisão financeira e estratégica. Rateios existentes foram preservados para não alterar decisões já registradas.

- Orçamento-modelo: aplicadas referências identificadas como **valores de teste** para custo e venda dos itens usados na proposta de demonstração, permitindo validar total, margem e rateio sem confundir os números com tabela comercial oficial.

- Levantamento e orçamento: incluída a Visão geral de quantitativos do projeto. Ela consolida os sistemas, itens e quantidades antes da distribuição por ambientes e funciona como base para a futura importação assistida de planta em PDF/imagem, sempre com validação técnica.

- Catálogo e levantamento: cada produto agora recebe uma classificação por **tipo técnico** e **função na obra**. A categoria comercial continua existente, mas o levantamento passa a indicar, por exemplo, “Switch de rede / distribuição de portas e PoE” ou “Cabo de rede / transporte de dados e alimentação PoE”.

- Levantamento técnico: gerado o primeiro modelo reverso a partir do orçamento atual, preservando ambiente, item, quantitativo e origem para revisão antes do uso como escopo validado.
- Fluxo comercial: criada a etapa Levantamento técnico entre Comercial e Orçamentos, com ambientes, pontos, quantitativos, origem manual/visita/PDF, validação e envio controlado dos ambientes ao orçamento.
- Regras comerciais: access points e pontos de rede passam a solicitar Cat6 próprio, com metragem configurável; access points existentes receberam regularização sem reaproveitar a metragem destinada aos keypads.
- Regras comerciais: keypads já presentes em orçamentos recebem uma migração única de infraestrutura, completando 30 m de Cat6 por keypad sem duplicar a metragem que já existe no ambiente.
- Regras comerciais: ao adicionar um keypad, o orçamento abre a infraestrutura vinculada, sugere cabo Cat6 e permite definir a metragem antes de incluí-la no mesmo ambiente.
- Catálogo: adicionado quadro de automação configurável Proelium com preço de referência de R$ 4.000,00.
- Orçamentos: ao selecionar cabo ou pré-infraestrutura, a quantidade parte de 30 m em vez de exigir rolos de 200 ou 300 m.
- Orçamentos: controles de quantidade, mover e distribuir agora avançam ou recuam de um em um; desconto permanece decimal para não limitar a negociação.
- Orçamentos: cabos e pré-infraestrutura agora usam distribuição por metragem, separada de portas, circuitos e canais. Mover ou ajustar um material linear abre a conferência de metros por ambiente.
- Catálogo: incluídos cabos de rede Cat6 (genérico homologado, UniFi/Ubiquiti, Sorro e Legrand) e cabos para alto-falante 18, 16, 14 e 12 AWG, todos por metro e inicialmente marcados para cotação.
- Base integrada: orçamento aprovado agora gera e mantém fichas de itens de execução ligadas ao projeto, cliente, ambiente, rateio, compra, instalação e ativo físico; também garante instalação e checklist padrão do projeto. O ativo instalado pode apontar para seu item de origem, preservando série, garantia e histórico técnico.
- Análise de orçamento: o toque no interruptor de rateio agora é tratado diretamente pela própria área do controle, evitando falhas de ativação ou desativação em tabelas no celular.
- Análise de orçamento: Rateio agora é um interruptor real com os estados “Ativar” e “Ativo”; desligá-lo, após confirmação, reúne o item no ambiente físico e libera suas conexões técnicas sem apagá-las.
- Rateio automático: produtos com capacidade identificável — como switches PoE, módulos PWM, dimmers e centrais por canais — passaram a preencher a capacidade física pelo próprio catálogo, sem redigitação pelo técnico.
- Análise de orçamento: Ratear passou a ser apresentado como interruptor; desligado, ativa o rateio automático igual entre os ambientes, e ligado, abre o ajuste fino da distribuição existente.
- Análise de orçamento: ações foram unificadas em todos os itens na ordem Ajustar, Ratear, Mover, Substituir e Excluir; nos rateados, Ratear e Mover abrem o ajuste do rateio completo, incluindo o local físico.
- Análise de orçamento: itens rateados agora usam a mesma tabela dos itens normais no ambiente físico, com ações, quantidade, venda, total e ajuste manual de rateio; qualquer item comum pode ser rateado automaticamente e de forma igual entre os ambientes do projeto.
- Tabelas: revisão automática dos cabeçalhos para manter a mesma quantidade de colunas e identificar corretamente colunas de ações; índices dos itens visíveis do orçamento preservam a referência real do ambiente.
- Análise de orçamento: itens rateados instalados fisicamente em um ambiente receberam visual de linha comercial, com destaque suave, capacidade e ajuste de rateio organizados;
- Análise de orçamento: equipamentos rateados e a ação Ajustar rateio passaram a aparecer somente no ambiente onde o equipamento está instalado fisicamente;
- Análise de orçamento: equipamentos rateados passaram para uma área única de gestão; as tabelas dos ambientes exibem somente itens diretos, enquanto o local físico mostra uma referência técnica do equipamento instalado;
- Análise de orçamento: removida a margem que sobrepunha ações ao título da proposta; Inserir pacote e revisão foram agrupados em “Mais opções” para preservar espaço;
- Análise de orçamento: tabelas por ambiente foram reconstruídas com a ordem padrão Item, Ações, Quantidade, Venda e Total, eliminando inversões entre cabeçalho e conteúdo;
- Análise de orçamento: a ação de rateio foi posicionada ao lado da quantidade de cada equipamento, dentro do respectivo ambiente;
- Análise de orçamento: todos os itens agora recebem ações padronizadas para ajustar, distribuir/mover, substituir e excluir;
- Orçamentos: adicionada ação direta “Item geral / ratear pelo projeto”, que abre o item já marcado para dividir custo e venda pelos cômodos da proposta;
- Rateios de portas: o orçamento agora separa capacidade física da capacidade usada na obra; somente as portas usadas recebem custo comercial e o diagrama compara portas rateadas, ocupadas e livres;
- Diagrama técnico: portas livres de switches e centrais podem ser ignoradas explicitamente no planejamento, sem registrá-las como consumo e com opção de reconsiderar depois;
- Orçamentos: adicionada ação Substituir, que troca um item preservando quantidade, desconto, local físico e, quando houver, rateio de capacidade e vínculos técnicos;
- Orçamentos: frações de equipamentos rateados em ambientes secundários agora aparecem com baixa ênfase e identificação do local físico do módulo;
- Orçamentos: itens agora podem ser excluídos por ambiente com confirmação, Auditoria e desfazer temporário; itens rateados são removidos de todos os ambientes para preservar o total;
- Orçamentos: a opção de rateio junto da quantidade passou a informar quantos cômodos receberão o valor do item;
- Orçamentos: adicionada leitura de circuitos de iluminação por ambiente, incluindo módulos instalados em outro cômodo e rateados pela capacidade atendida;
- Orçamentos: módulos de iluminação rateados agora mostram, ao lado da fração do módulo em cada ambiente, os circuitos efetivamente disponibilizados;
- Navegação móvel: restaurada a rolagem vertical ao iniciar o gesto dentro de tabelas, filtros, cartões e janelas de formulário;
- Orçamentos: a caixa “Ratear por todos os cômodos” também está disponível no modo Ajustar, junto da quantidade, para distribuir um item que já foi incluído;
- Orçamentos: a ação Mover foi incorporada a Distribuir; agora basta ajustar a participação de cada ambiente para transferir parte ou todo o item;
- Orçamentos: a opção de ratear um item por todos os cômodos agora fica ao lado da quantidade, antes de inserir o item;
- Diagrama técnico: adicionada a base de pontos técnicos por ambiente, com vínculo opcional a switch/central, conferência de portas usadas/livres, avisos de capacidade excedida e auditoria de criação, ajuste ou exclusão;
- Infraestrutura compartilhada: ao adicionar um item ao orçamento, roteadores, switches, racks, nobreaks e cabeamento de rede sugerem automaticamente o modo “Item geral”, distribuindo valor de forma igual por todos os ambientes e mantendo o local físico registrado;
- Rateios técnicos: a janela agora exibe conferência ao vivo de capacidade total, valor distribuído e saldo antes da confirmação;
- Orçamentos por ambiente: cada cômodo agora possui o botão “Adicionar item”, que abre o catálogo com o ambiente correto já escolhido;
- Orçamentos no celular: comparação estratégica, histórico de versões, rateios técnicos e cartões de ambiente agora usam toda a largura útil; tabelas continuam com rolagem interna quando necessário;
- Formulários no celular: janela centralizada no espaço útil, eliminando o vão lateral irregular;
- Formulários no celular: a janela de registro passou a usar quase toda a largura útil da tela, com margens e preenchimento reduzidos;
- Orçamentos por ambiente: a tabela ficou mais compacta, com ações Ajustar, Mover e Distribuir, sem coluna de desconto na visualização;
- Correção mobile: o seletor de ambientes do orçamento deixa de ficar preso sobre o conteúdo, evitando travamento e bloqueio da rolagem;
- Rateios técnicos: itens compartilhados agora distinguem local físico de ambientes atendidos e usam a ação “Editar rateio / local físico” em vez de mover o item isoladamente;
- Orçamentos: itens centrais agora podem distribuir capacidade entre cômodos, rateando custo e venda por circuitos, canais, zonas ou outra unidade técnica;
- Orçamentos no celular: o seletor de ambientes acompanha a rolagem da análise e permite deslizar entre os cômodos;
- Comercial: avanço de oportunidade agora exige conferência dos dados essenciais, assinatura do operador identificado e registra a autorização na Auditoria;
- Status do servidor: o resumo agora informa a área e uma descrição curta da última ação sincronizada;
- Auditoria e sincronização: data e hora passam a ser exibidas com segundos, e o estado do servidor informa a última sincronização deste aparelho e o responsável pela última ação registrada;
- Orçamentos: ao mover apenas parte de um item entre cômodos, a janela permanece aberta com o saldo atualizado; ela fecha somente ao transferir a última unidade;
- Correção crítica: restaurada a inicialização da interface após a atualização do catálogo Scenario Embrace;
- Produtos e serviços: importado o catálogo Scenario Embrace da tabela fornecida, com códigos, modelos, acabamentos e valores de referência de junho de 2021, sujeitos à validação antes de cotar;
- Orçamentos: itens podem ser movidos parcialmente entre cômodos, escolhendo a quantidade e preservando desconto e auditoria da alteração;
- Menu: Visão geral, Comercial, Orçamentos, Clientes e Produtos e serviços agora formam o grupo Comercial;
- Adicionada aba Orçamentos para consulta unitária de propostas e ação Mover em Equipamentos, com histórico técnico e auditoria de troca de local;
- Novo registro comercial: adicionada descrição livre e opcional da origem do contato;
- Correção do cadastro comercial: a versão final do formulário preserva cliente e pessoa de contato manuais, e a importação do aparelho preenche telefone/e-mail de forma compatível;
- Cadastro comercial: importação do aparelho voltou antes da pessoa de contato e agora preenche somente telefone/e-mail; nome do cliente e responsável pelo cliente permanecem manuais;
- Novo registro comercial reorganizado: Cliente / empresa, dados de contato manual e pessoa responsável pelo cliente ficaram separados do responsável interno pelo atendimento;
- Comercial: o visor de oportunidades ganhas agora contabiliza todos os negócios concluídos e informa separadamente quantos já viraram clientes;
- Indicadores do Comercial passaram a ser interativos, levando às oportunidades em atendimento, próximas ações, ganhas e perdidas;
- Auditoria: exclusões de oportunidades comerciais agora ficam disponíveis para recuperação segura pelo próprio histórico;
- Comercial: oportunidades em tratamento agora podem ser excluídas com confirmação, limpeza do orçamento ainda não aprovado e opção de desfazer;
- Menu lateral com rolagem própria: marca Proelium e estado do servidor permanecem fixos;
- Menu reorganizado pelo fluxo de informação: Comercial, Projeto e orçamento, Operação e pós-venda, Pessoas e padrões e Gestão;
- Clientes: adicionada ação de exclusão diretamente na lista, com confirmação e limpeza dos registros vinculados;
- Incluído cenário demonstrativo de Lista de obra e compras para as sete obras fictícias, com itens em planejamento, cotação, compra, recebimento e conferência;
- Corrigida a navegação persistente entre módulos após atualizações automáticas da interface;
- O Diagrama técnico agora também organiza por ambiente os itens vindos diretamente da Lista de obra, mesmo sem orçamento aprovado vinculado;
- A Lista de obra e compras agora possui um botão Gerar diagrama para cada projeto, abrindo a leitura técnica já focada na obra escolhida;
- Exclusão de cliente reforçada: agora remove todos os registros técnicos, operacionais, financeiros, de compras e avaliações ligados aos projetos do cliente;
- Novo registro comercial revisado: exige cliente, contato, telefone, e-mail e responsável; os demais campos são opcionais e contam com sugestões de origem, etapa e próxima ação;
- A análise de orçamento agora deixa explícito o resumo por ambientes dentro do próprio orçamento e permite filtrar a visualização de um cômodo específico;
- Ajustado o cabeçalho móvel: data e hora sobem para ficar mais próximas da logo EMS Studio e não disputar espaço com o título da Central Operacional;
- Fluxo de entrada de clientes reforçado: Clientes não permite inclusão direta; oportunidades passam pelo Comercial e só viram cliente quando concluídas como Ganho ou aprovadas no orçamento;
- Adicionadas as áreas Diagrama técnico e Auditoria: o diagrama organiza os itens do orçamento por ambiente a partir de um ponto técnico central; a auditoria registra data, hora, usuário atual, ação e área alterada;
- Nova Lista de obra e compras: gera materiais de projetos a partir de orçamentos aprovados, permite inclusão manual e acompanha a sequência Planejado, A cotar, Comprado, Recebido e Conferido;
- Orçamentos agora contam com autoconsulta do catálogo ao digitar; itens ausentes podem entrar como “a cotar” e passam para uma fila de aquisição sem criar preço fictício;
- Agenda integrada ao relatório de serviço: compromissos vinculados a projetos agora permitem registrar a execução, fotos, testes e pendências diretamente pela consulta do dia;
- Projetos agora podem ser editados e excluídos; a exclusão remove de forma coerente os registros operacionais, agenda, execução, financeiro e avaliações vinculados;
- Correção de estabilidade do Acompanhamento: a tabela agora aceita tanto linhas individuais quanto listas, eliminando o erro que bloqueava a abertura da tela;
- Inicialização estabilizada: a interface aguarda a carga dos módulos antes de renderizar a página salva anteriormente;
- Colaboradores e parceiros agora possuem regra de pagamento: modalidade, valor-base, comissão, vigência e observações, com sugestão de valor na execução;
- Nova área Execução e mão de obra: registra diárias, horas, materiais, fretes, terceirizados e outros gastos por projeto, com reflexo automático no Financeiro e BI;
- Acompanhamento passa a listar todos os projetos vinculados por padrão, sem ocultá-los pelo filtro de busca global;
- Correção da leitura integrada de Acompanhamento: a tabela agora aceita corretamente as linhas geradas pelo painel e volta a exibir os projetos vinculados;
- Correção de abertura do Acompanhamento: a tela agora protege contra dados ainda não sincronizados e permanece acessível mesmo durante a atualização compartilhada;
- Operação detalhada por tipo de atendimento: a OS agora destaca Visita técnica, Instalação, Manutenção, Chamado, Troca ou Retirada, além de escopo, equipamento, projeto e relatórios;
- Acompanhamento integrado aos projetos: agora reúne automaticamente cliente, etapa, agenda, pendências, OS, relatórios e instalação, mesmo antes de existir um cadastro técnico de instalação;
- Correção do atalho de Privacidade no computador: o botão agora trata o clique diretamente, inclusive sobre a tela de proteção;
- Botão fixo de Privacidade deslocado para a esquerda, evitando sobreposição com a lupa;
- Botão fixo de Privacidade adicionado: ativa e fecha a tela de proteção sem depender do painel da lupa;
- Tela de abertura: dedicatória reformulada como celebração de presença, experiência e inspiração de Ernani Queiroz Andrade;
- Controle de intensidade da arte movido para o painel da lupa, junto das preferências de leitura, tema e contraste; no celular, ficou menor e mais abaixo no painel;
- Relatório de campo padronizado: execução, testes, pendências, próxima ação e até três fotos comprimidas, exibidas no histórico técnico do projeto e da OS;
- Cenário demo ampliado: novos clientes, obras, tarefas, OS, relatórios, lançamentos financeiros, avaliações e oportunidades para testar os painéis com maior movimentação;
- Controle de arte refinado: a intensidade agora reforça a ilustração diretamente sobre o tema, sem aplicar véu branco na tela;
- BI Desempenho: novo quadro de time operacional e liderança, incluindo Ernani Queiroz, com evidências de avaliações, tarefas, OS e projetos vinculados;
- Nomenclatura padronizada: BI Intelligence para a visão geral do negócio e BI Desempenho para a leitura por obra;
- Bloco 7 ampliado: margem por produto e serviço, prazo médio baseado em registros reais de execução/entrega, visão por responsável e etapa, e fila de pendências vencidas;
- Correção móvel: botão do menu e barra lateral passam a ficar acima do modo privacidade, mantendo a navegação acessível;
- Modo privacidade: marca central elevada de forma mais acentuada, com deslocamento maior no celular;
- Modo privacidade: removida a assinatura interna da Proelium com fundo claro; permanece somente a marca discreta no canto;
- Modo privacidade: assinatura EMS Studio elevada em computador e celular, com deslocamento maior no celular;
- Modo privacidade no celular: marca EMS Studio elevada para alinhar visualmente à assinatura da abertura;
- Correção móvel: isolada a marca do modo privacidade das regras do cabeçalho; menu e controle de privacidade voltam a permanecer acessíveis;
- Modo privacidade: escala da assinatura EMS Studio unificada à da tela de carregamento em computador e celular;
- Modo privacidade no celular: posição da logo central equilibrada após a composição com a ilustração;
- Modo privacidade no celular: ilustração sazonal agora atravessa sutilmente a área clara da marca EMS Studio, preservando sua leitura;
- Modo privacidade no celular: marca EMS Studio movida mais abaixo conforme ajuste visual;
- Modo privacidade no celular: posição vertical da marca EMS Studio refinada novamente;
- Modo privacidade no celular: logo central da EMS Studio deslocada mais abaixo para melhorar o equilíbrio visual;
- BI de desempenho remodelado: terminal de obras com mini-curvas por projeto, filtros e análise detalhada de execução, custo, prazo, margem e discrepâncias ao selecionar uma obra;
- Marca EMS Studio ampliada no cabeçalho de desktop, tablet e celular, com espaço vertical adicional para preservar a leitura de data e hora;
- Bloco 6 concluído como MVP: ativos instalados vinculados a cliente/projeto, ordens de serviço sincronizadas à agenda, chamados de pós-venda e histórico técnico do cliente;
- OS integrada como centro de rastreabilidade: vincula cliente, projeto, orçamento aprovado, checklist, ativo técnico, relatório de campo e entrega/aceite;
- Bloco 7 iniciado: lançamentos financeiros de receita, despesa, pagamento e recebimento; comparação previsto × realizado e BI com filtros por período, cliente, responsável e categoria.
- Bloco 7 validado: correção no cálculo dos lançamentos; teste de custo realizado e reflexo no BI executado e removido do banco compartilhado.
- Bloco 5 iniciado: ficha de execução por projeto com avanço de etapas, checklist, tarefas, relatórios de serviço e conexão com a instalação vinculada;
- Bloco 5 concluído como MVP: checklist padrão aplicável aos projetos, atualização automática para novos projetos e entrega formal com aceite do cliente;
- Cabeçalho reorganizado: logotipo da EMS Studio centralizado na parte superior, com data e hora posicionadas logo abaixo da marca em desktop e celular;
- Assinatura da Proelium no rodapé do computador movida para a área clara, após o menu lateral;
- No modo privacidade do celular, a marca EMS Studio foi deslocada para o centro visual da tela;
- Proteção de inicialização adicionada: a tela de dedicatória é fechada automaticamente mesmo se algum módulo complementar falhar; cache do aplicativo atualizado;
- Cabeçalho do celular ajustado com áreas separadas para a marca EMS Studio e para data/hora, evitando sobreposição;
- Título “Central Operacional” deslocado levemente à esquerda no cabeçalho móvel para preservar a leitura da data;
- Revisões de orçamento agora exigem solicitação com motivo obrigatório; rascunhos são ajustados diretamente, propostas aprovadas não podem ser revisadas, e o histórico da família registra versão, situação, data e motivo;
- Situações do orçamento receberam feedback visual por cor; inserção de pacote agora orienta quando ainda faltam pacote ou cômodo, e revisões preservam a numeração correta da família do orçamento;
- Corrigida a ordem de inicialização dos módulos para impedir que a tela de carregamento permanecesse aberta ao restaurar a aba Comercial;
- Colaboradores e parceiros agora possuem perfil interativo: consulta de dados profissionais, indicadores e histórico de avaliações; cadastro e edição atualizam o perfil existente;
- Bloco 4 concluído: orçamento por cômodo com quantidade, desconto por item, total bruto, desconto total, valor líquido, custo e margem por ambiente;
- situações de orçamento: Rascunho, Enviado, Aprovado, Recusado e Vencido; revisões criam uma nova versão preservando a anterior;
- aprovação passa a criar/atualizar o projeto com os valores líquidos e custos calculados pelos ambientes;
- assinatura Proelium Serviços adicionada ao canto inferior esquerdo em desktop e celular;
- Bloco 3 iniciado: catálogo agora possui fornecedor, edição e status ativo/descontinuado; pacotes reutilizáveis podem reunir produtos, serviços e mão de obra e ser inseridos em orçamentos;
- edição do catálogo ampliada com campo de modelo; Equipamentos e ativos agora permitem cadastrar e editar cada unidade física com marca, modelo, número de série, local e status;
- logo oficial fornecida da EMS Studio aplicada à abertura, ao cabeçalho e ao modo privacidade;
- marca EMS Studio ampliada com escala própria para desktop e celular;
- cabeçalho desktop recebeu mais espaço para a marca EMS Studio, com data deslocada à esquerda;
- logo EMS Studio ampliada novamente nas versões desktop e celular;
- logo do cabeçalho móvel recebeu ampliação adicional;
- cabeçalho móvel reorganizado com data e relógio mais baixos para dar maior presença à marca;
- controle de intensidade da arte no celular reorganizado em duas linhas para evitar sobreposição;
- marca EMS Studio no cabeçalho móvel movida para baixo e à esquerda, com ampliação adicional;
- cabeçalho móvel alinhado: marca deslocada à direita e menu/título posicionados na mesma faixa visual;
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
