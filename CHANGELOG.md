# Histórico de versões

## Em desenvolvimento

- Migração incremental iniciada: criado o frontend Next.js 16 + React 19 + TypeScript em `frontend/`, com shell inicial e entrada OAuth Google apontando para a API existente. A aplicação legada permanece ativa durante a validação da primeira fatia.
- Primeira fatia funcional avançada: shell Next.js passou a consultar a sessão atual, exibir o acesso Google e oferecer o login mestre pela API legada, com proxy local para `localhost:4173`.
- Shell autenticado ampliado com logout e resumo inicial de clientes, projetos, tarefas e lançamentos financeiros via `/api/data`, sem substituir os módulos legados.
- Menu lateral e navegação inicial adicionados ao shell Next.js, com pontos de entrada para Visão geral, Clientes, Projetos, Comercial, Financeiro e Indicadores; módulos ainda são migrados individualmente.
- Menu conectado às rotas migradas de Clientes e Projetos, mantendo as demais áreas como pontos de transição controlados.
- Rota Comercial adicionada em modo somente leitura, com oportunidades e orçamentos consumidos da API atual.
- Rota Financeiro adicionada em modo somente leitura, com lançamentos autorizados e total calculado no frontend.
- Base visual e cliente HTTP compartilhados adicionados ao frontend Next.js, preparando os próximos módulos para componentes e estilos consistentes.
- Rota de Indicadores adicionada em modo somente leitura, com métricas iniciais de clientes, projetos, comercial, tarefas e lançamentos usando o cliente HTTP compartilhado.
- Menu principal conectado também às rotas migradas de Comercial, Financeiro e Indicadores.
- Rota de Operação adicionada em modo somente leitura, com tarefas e ordens de serviço consumidas pela API atual.
- Rota de Conhecimento adicionada em modo somente leitura, com artigos e referências técnicas da API atual.
- Rota de Equipamentos adicionada em modo somente leitura, com catálogo técnico, fabricante, status e localização.
- Rota de Colaboradores adicionada em modo somente leitura, com equipe, função e especialidade consumidas da API atual.
- Rota de Levantamento técnico adicionada em modo somente leitura, com levantamentos e pontos técnicos consumidos da API atual.
- Rota de Catálogo adicionada em modo somente leitura, com produtos e serviços consumidos da API atual.
- Rota de Agenda adicionada em modo somente leitura, com compromissos e próximos eventos consumidos da API atual.
- Rota de Qualidade adicionada em modo somente leitura, com avaliações, média e comentários consumidos da API atual.
- Rota de Relatórios adicionada em modo somente leitura, com registros de serviço e entregas de projetos.
- Rota de Compras adicionada em modo somente leitura, com itens, quantidades e status de materiais consumidos da API atual.
- Rota de Instalações adicionada em modo somente leitura, com execuções de campo, projeto e status.
- Rota de Rotinas adicionada em modo somente leitura, com procedimentos e checklists operacionais.
- Rota de Configurações adicionada em modo somente leitura, com identidade, responsável, status e licença da empresa autenticada.
- Rota de Usuários da empresa adicionada em modo somente leitura, respeitando o endpoint protegido e exibindo função e situação de cada participante.
- Rota de Convites adicionada em modo somente leitura, exibindo destinatário, função e situação do convite.

- Projeto do produto consolidado no `PROJECT.md`: visão, problema, público, fluxo, módulos, entidades, regras, plataformas, fronteiras e critérios de sucesso do aplicativo Proelium Operacional.
- Separada a documentação do produto da documentação de migração: `PROJECT.md` volta a representar somente o aplicativo, enquanto `docs/MIGRACAO-REACT-NEXT.md` concentra a evolução técnica.

- Levantamento inicial reorganizado por necessidades do cliente: Automação, Áudio e vídeo, Conectividade e Câmera e Acessos. Os itens passam a alimentar futuramente orçamento, materiais e biblioteca de conexões; registros já existentes são preservados.
- Checklist do levantamento ganhou árvore expansível, seleção por item, quantidade compacta e nota comercial/técnica persistida junto ao requisito.
- Conta fundadora da empresa passou a ser elegível como responsável interno pelas oportunidades.

- Cronograma: fases e cores agora podem ser configuradas pelo fundador/administrador da empresa, com suporte a novas fases e isolamento por empresa.
- Cronograma: previsão operacional passou a oferecer sugestão automática e transparente de dias, equipe e horas a partir de ambientes, itens do orçamento e pontos do levantamento, sempre com ajuste manual antes de salvar.
- Catálogo comercial reorganizado: Produtos e Serviços ganharam entradas separadas no fluxo de Orçamentos; produtos representam equipamentos/materiais e serviços representam mão de obra, com classificação preservada nos itens existentes. A Biblioteca técnica absorveu a área de conexões e passou para Projetos 360°, mantendo as rotas internas antigas para compatibilidade.
- Regra de licença corrigida: uma empresa já aprovada com licença pendente não recebe mais o pacote de avaliação completo; o acesso passa a seguir os módulos liberados, enquanto o pacote de análise fica reservado ao cadastro ainda pendente.
- Compatibilidade do ambiente local corrigida: o espelho JSON antigo agora recebe as coleções ausentes em memória sem apagar registros existentes, evitando quebra ao abrir Colaboradores, Financeiro e BI; cache web incrementado para `v316`.
- Inicialização visual corrigida na camada de boot: o shell autenticado só é revelado depois do render final e da tentativa de sincronização, evitando mostrar um menu intermediário antes do menu completo; atualização crítica do service worker passou a ativar automaticamente o shell novo e o cache web foi incrementado para `v321`. No localhost, caches e registros antigos do service worker são removidos automaticamente, sem tocar nos dados locais.
- Smoke bot ajustado para aceitar o arquivo principal com identificador de cache versionado.
- Bot de uso da interface passou a validar o menu completo no primeiro quadro autenticado, antes de qualquer clique de navegação.
- Boot desacoplado da sincronização: a conta entra assim que a autenticação e o shell final estão prontos; a leitura dos dados compartilhados continua em segundo plano e não bloqueia a tela.
- Cadastro Google destravado: depois que a ficha de identificação é aceita pelo servidor, a sessão libera imediatamente o app e a sincronização posterior não consegue prender o usuário na confirmação Google.
- Renovação do shell web reforçada: o registro do service worker agora usa o mesmo identificador da correção Google, evitando que abas públicas mantenham o shell anterior com controles sem resposta.
- Fluxo comercial refinado: Lista de obra e compras e Minhas rotinas passam para Comercial; o orçamento agora oferece entradas explícitas para produtos e serviços, com serviço novo podendo ser criado diretamente no cálculo.
- Previsão operacional no Projeto 360°: prazo, diárias, equipe, horas e custo estimado de mão de obra ficam editáveis no cronograma, com margem operacional separada do valor comercial aprovado.
- Cronograma visual por projeto: a tela de acompanhamento agora lista as obras e apresenta a previsão em uma linha de quadrados diários, com cores para projeto técnico, infraestrutura, instalação e entrega.
- Fixture do bot de uso local atualizado para reconhecer o rótulo atual “Pós-venda”, evitando falso negativo durante a validação da interface.
- Fluxo local-first criado: branches `codex/...` e `Validar-Local.ps1` concentram sintaxe, smoke bot, teste de interface e revisão do diff antes de qualquer merge na `main`; o VPS permanece intacto durante o desenvolvimento.
- Estrutura do menu empresarial alinhada ao fluxo solicitado, com grupos Comercial, Projetos, Pós-venda, Gestão, Pessoas e acessos e Conta pessoal; itens internos permanecem disponíveis dentro do Projeto 360°.
- Conta fundadora marcada como acesso ilimitado dentro da própria empresa, mantendo a separação da administração da plataforma.
- Conta fundadora alinhada ao menu empresarial de referência: Comercial, levantamentos, orçamentos, compras, execução, gestão e pessoas passam a ser visíveis no ambiente da própria empresa, sem liberar administração da plataforma.
- Smoke bot tornado autônomo no ambiente local: `npm run test:bot` inicia um servidor temporário quando nenhuma URL externa é informada, aguarda o health check e encerra o processo ao finalizar; a documentação de publicação foi alinhada ao domínio HTTPS validado.
- Corrigida a reorganização do menu: conexões de produtos e diagrama técnico voltam a ficar acessíveis, Conhecimento recupera seu nome e BI volta a ter rótulos distintos; Processos permanece absorvido pelo Projeto 360°.

- Exemplos comerciais demonstrativos adicionados de forma segura e idempotente: carga opcional de cinco ciclos identificados como DEMO, cobrindo oportunidade aberta, levantamento, proposta enviada, aprovação com cliente/projeto e recusa sem conversão. Nenhum registro existente é apagado ou substituído.
- Área comercial consolidada em um fluxo único: oportunidade, levantamento, orçamento, decisão e conversão em cliente/projeto. Cada oportunidade agora mostra o próximo passo real, o orçamento mais recente e atalhos coerentes; a conversão manual é bloqueada sem orçamento aprovado.
- Bot comercial ampliado para percorrer ciclos completos: oportunidade até orçamento, revisão preservada, cálculo de bruto/desconto/líquido/custo, aprovação convertida em cliente e projeto e recusa encerrada sem conversão.
- Matriz de contas explorada pelo bot: conta mestre e suporte ficam restritos à central, fundador recebe os módulos da própria empresa, colaborador convidado respeita o cargo e perfil pessoal permanece separado dos dados operacionais.
- Visibilidade do produto para fundadores corrigida: a conta fundadora agora vê todos os módulos pertinentes ao seu perfil de empresa durante a avaliação, mesmo quando a licença ainda está limitada; os colaboradores convidados continuam obedecendo cargo e permissões.
- Menu reorganizado: “Minhas rotinas” deixou de cair em “Outros” no topo e agora aparece junto de “Pessoas e padrões”, respeitando a ordem comum entre os ambientes empresariais.
- Conta fundadora e perfil pessoal separados: quem abre uma empresa fica registrado como fundador e administra os usuários daquele `companyId`; ao sair ou ter o vínculo encerrado, a conta Google permanece ativa como perfil pessoal com portfólio, sem carregar clientes, projetos, orçamentos ou outros dados privados da empresa.
- Empresas em análise recebem módulos pertinentes ao seu tipo de entrada durante o acesso limitado, enquanto a licença continua sob controle da administração da plataforma. Os campos de fundador, perfil, portfólio e permissões agora persistem também no PostgreSQL.
- Usuários de suporte separados dos ambientes empresariais: o painel global lista somente contas sem `companyId`, o cadastro de suporte nunca aceita vínculo com empresa e a API impede que uma conta empresarial seja administrada pela lista global. A equipe de suporte pode consultar o status das empresas sem acessar seus dados operacionais.
- Contato dos administradores de contas incluído na central: cada empresa exibe o administrador Google responsável e atalhos seguros para e-mail e WhatsApp, mantendo a comunicação fora dos dados privados dos projetos.
- Conta mestre protegida no cadastro global: ela continua administradora da plataforma e não pode ser rebaixada para suporte nem alterada como usuário comum.
- Logout tornado independente do vínculo do botão: a ação global encerra a sessão mesmo após recarga ou atualização do PWA, permitindo trocar da empresa para o acesso mestre.
- Botão **Sair** do cabeçalho fixado ao lado da identificação do usuário, com saída funcional para trocar da conta empresarial para o acesso mestre sem limpar a sessão manualmente.
- Saída de sessão reforçada: o botão **Sair** fica disponível no cabeçalho e no menu lateral para encerrar a sessão Google e permitir uma nova entrada sem limpar cookies manualmente.
- Administração da empresa ampliada: o administrador empresarial vê as configurações mesmo com licença limitada, edita identificação e contato da própria empresa e acessa equipe e convites sem enxergar a administração da plataforma.
- Gestão de contas empresariais esclarecida: cada participante é identificado por sua conta Google; a empresa controla função, ativação, remoção e exceção de acesso, enquanto senhas Google permanecem fora do Proelium.
- Carregamento da equipe corrigido ao abrir o módulo, evitando que o administrador fique preso em uma tela de configuração sem participantes.
- Isolamento de empresas corrigido no primeiro acesso: uma empresa sem estado remoto começa sem clientes, projetos, orçamentos, tarefas, equipe ou dados demonstrativos; o catálogo técnico é inicializado separadamente.
- Menu reorganizado por escopo: a conta mestre vê somente a Central de suporte, Empresas e licenças e Usuários de suporte; os dados operacionais permanecem exclusivamente nos ambientes das empresas.
- Central de suporte da plataforma criada com indicadores de solicitações, licenças, empresas aprovadas e usuários vinculados, além do roteiro de análise e liberação.
- Conta mestre da plataforma separada do e-mail empresarial: o usuário `admin` não possui e-mail nem `companyId` e administra empresas, licenças e usuários globais; o e-mail do Michel permanece reservado à administração da própria empresa.
- Tela de autenticação mantém Google como entrada padrão e oferece acesso administrativo separado para a conta mestre sem e-mail.
- Administração por empresa: o cargo define o acesso padrão de cada colaborador, e o administrador da própria empresa pode liberar ou retirar uma exceção de acesso total dentro daquele ambiente, sem conceder administração da plataforma.
- Visibilidade por licença aplicada na API: orçamentos, salas e dados comerciais continuam restritos ao escopo comercial; quando um orçamento é convertido em projeto, o projeto e seus dados operacionais ficam disponíveis aos colaboradores da mesma empresa com permissão de projetos/operação/financeiro, sem expor dados a outras empresas.
- Sincronização protegida por escopo: cada usuário recebe somente os domínios de dados compatíveis com suas permissões, gravações parciais preservam os demais domínios da empresa e o cache local passou a ser separado por empresa e usuário.
- Licença da empresa incorporada à sessão: após a análise da plataforma, o próximo login aplica o nível e os módulos autorizados também ao proprietário do cadastro, sem perder as restrições específicas de um convite.
- Painel de empresas em análise agora permite excluir uma empresa de forma exclusiva pela administração da plataforma, removendo também usuários, convites, rotinas e dados operacionais vinculados, com confirmação explícita.
- A lista de usuários da empresa permanece limitada aos participantes do `companyId` do administrador; a lista global continua disponível somente para a administração da plataforma.
- Auditoria de isolamento reforçada: o administrador de uma empresa não consegue revogar convites de outra, e as rotas de convite continuam usando exclusivamente o vínculo da sessão autenticada.
- Convites Google agora adicionam automaticamente o participante à empresa convidante, renovam a sessão já com o `companyId` correto e impedem que um usuário vinculado seja movido para outra empresa.
- Presença, colaboração e pedidos de auxílio em tempo real passaram a ser transmitidos somente entre usuários da mesma empresa; os dados de clientes, orçamentos, projetos e demais módulos continuam separados por empresa.
- Painel de empresas corrigido para recarregar as solicitações ao ser aberto, evitando que cadastros feitos depois da entrada do administrador permaneçam invisíveis por causa de uma lista antiga.
- Segurança de sessão reforçada: cada requisição protegida agora confirma no armazenamento que o usuário ainda existe e está ativo; exclusões e desativações revogam imediatamente sessões antigas, inclusive no `/api/auth/me` e no acesso aos dados.
- Separadas as administrações: plataforma controla empresas, licenças e usuários globais; cada empresa controla somente seus próprios participantes.
- Convites de empresa agora têm tela própria de participantes, vínculo exclusivo por Google, expiração de cinco minutos e compartilhamento direto pelo WhatsApp.
- Convites para novos e-mails Google agora entram no fluxo correto de adesão à empresa, sem abrir cadastro duplicado de empresa.
- Bot de navegação atualizado para acompanhar o login Google-only por sessão de teste e percorrer as áreas sem depender de campos de usuário e senha removidos da interface.
- Estado operacional separado por empresa no servidor e no armazenamento local do navegador; atualizações em tempo real também ficam limitadas à empresa da sessão.

- Painel administrativo agora exibe e alterna a licença de uso separadamente do acesso limitado.

- Conclusão do cadastro Google corrigida: ficha salva e redirecionamento limpo para o app com acesso limitado.

- Após o cadastro Google, a empresa recebe acesso limitado imediato; a licença de uso permanece pendente para aprovação administrativa.

- Campo redundante “Tipo de entrada” removido; o perfil escolhido nos cartões passa a definir essa informação.

- Cadastro simplificado: somente Google verificado, perfil, nome, documento, responsável e telefone são obrigatórios; detalhes complementares ficam opcionais.

- Prestadores e clientes finais podem informar CPF ou CNPJ; empresas continuam exigindo CNPJ válido.

- Campo da empresa renomeado para mensagem ou dúvida preliminar, com aviso de aprovação administrativa antes do acesso.

- Transição da escolha de perfil para a ficha corrigida, liberando o formulário após o clique.

- Estado inicial do onboarding protegido: cartões visíveis e envio oculto até a escolha do perfil.

- Fichas por perfil com campos específicos para empresa, cliente final e prestador; liberação permanece condicionada à análise.

- Ficha de identificação por perfil agora é obrigatória e informa que a liberação depende de análise.

- Ordem dos perfis ajustada para Prestadores, Empresa e Cliente Final.

- Tela de escolha de perfil protegida para não exibir campos do cadastro antes da seleção.

- Escolha de perfil apresentada como tela independente antes do formulário de cadastro.

- Escolha de perfil movida para antes dos campos do cadastro, com acentos nas três cores da identidade Proelium.

- Campo de contato renomeado para Telefone, sem referência visual a aplicativo específico.

- Cadastro Google inicia com três perfis visuais e coleta informações de contexto específicas para empresa, cliente final ou prestador.

- Seletor de telefone compacto com bandeiras e código internacional ao lado do número.

- Cadastro Google inicia com a escolha do perfil de entrada: residência com sistema Proelium, contratante ou contratado.

- Textos da autenticação alinhados ao centro abaixo da logo.

- Campo de WhatsApp com país e número na mesma linha, mantendo máscara brasileira e padrão internacional no envio.

- Cadastro Google: rascunho local dos dados e telefone com país padrão Brasil e seleção internacional.

- Multiempresa: painel de empresas com níveis de acesso, convites de colaboradores com validade de cinco minutos, vínculo por Google e permissões por módulo; tokens de convite armazenados somente como hash.

- Catálogo Scenario Embrace: preços-base do catálogo de São Paulo (junho/2021) preservados como custo e preço de repasse calculado com acréscimo comercial provisório de 20%, sem preencher automaticamente valores fictícios para itens sem fonte validada.

- Orçamentos de teste: removido o botão de recriação da interface após a validação dos cenários técnicos.

- Menu mobile: ocultação do botão agora acompanha diretamente o estado real do menu aberto, evitando que ele reapareça sobre o painel.

- Menu mobile: botão desaparece enquanto o menu está aberto e recebeu visual mais claro, com transição suave e contraste adequado.

- Cabeçalho mobile: reservado espaço para o botão flutuante, impedindo que o nome da área/aba fique sob o controle de menu.

- Menu mobile: botão removido da hierarquia do cabeçalho e transformado em controle flutuante independente, evitando que cards ou camadas do conteúdo o cubram.

- Menu mobile: botão superior convertido para formato semiquadrado com cantos arredondados e camada elevada para permanecer acima dos cards durante a rolagem.

- Menu: padronizado botão flutuante superior para telas compactas em iOS, Android, PWA e Windows, com área de toque ampliada e resposta tátil consistente.

- Menu mobile: botão reposicionado como controle flutuante circular, com área de toque maior e posição livre de conflitos com cabeçalho e rodapé.

- Desktop: reorganizado o dock inferior para separar marca, status, privacidade, acessibilidade e bloqueio de zoom, evitando sobreposição com o rodapé do sistema.

- Mobile: ajustados menu, cabeçalho, rodapé de status e botões flutuantes para evitar sobreposição em telas estreitas e respeitar a área segura do iOS.

- Presença: corrigida a rotina final de renderização para atualizar o contador de usuários distintos junto com a lista de dispositivos.

- Presença: badge passa a usar o conjunto de nomes de usuário distintos, sem contar sessões ou dispositivos.

- Presença: contador passa a ser calculado a partir dos participantes efetivamente renderizados na lista, evitando divergência entre nomes exibidos e número mostrado.

- Atualização contínua: restaurada a tela de atualização, que permite salvar e aplicar conscientemente cada nova versão do PWA.

- Atualização contínua: o novo service worker assume automaticamente o controle quando uma versão nova é instalada, eliminando a dependência de fechar abas ou atualizar manualmente.

- Presença: contador e lista são reaplicados após cada renderização da interface, evitando que uma troca de tela sobrescreva a atualização online.

- Presença: painel online agora faz atualização de contingência a cada 10 segundos, além do canal contínuo, garantindo que usuários apareçam mesmo com interrupções temporárias do SSE.

- Clientes nativos: Windows 0.1.4 e Android 1.5 passam a usar o domínio HTTPS público `app.proeliumservicos.com.br`, compartilhando presença e sincronização com o navegador.

- N.E.M.O.: ciclo somente leitura finalizado com fixture sanitizada, recomendações fundamentadas e testes para dados inválidos e compromissos cancelados.

- N.E.M.O.: contrato operacional oficial incorporado e análise somente leitura alinhada para oportunidades sem próxima ação, tarefas vencidas e compromissos não cancelados.

- PWA/iOS: cache do shell renovado para forçar o Safari a descartar a interface antiga e carregar a identidade atual do Proelium.

- Privacidade: criada estrutura para separar código público de dados operacionais futuros, com modelo de ambiente, regras de exclusão e checklist de publicação.

- Testes: removidas senhas fixas dos cenários; o bot funcional gera uma credencial efêmera ou usa `PROELIUM_TEST_PASSWORD` quando fornecida.

- Financeiro: lançamentos agora podem ser vinculados às contas cadastradas, alimentando o saldo projetado de cada conta.
- Financeiro: criada a base de contas financeiras, com instituição, tipo, saldo inicial e saldo projetado a partir dos lançamentos vinculados.

## Em desenvolvimento

- Menu: removido o módulo BI Desempenho da interface e das permissões de navegação; a visão BI Intelligence permanece disponível. Cache do shell atualizado para v207.

- Bot de uso real: criado o comando `npm run test:real-use`, que avalia o shell publicado e os módulos essenciais em modo somente leitura, separando a validação do uso real dos cenários artificiais do bot funcional.
- N.E.M.O.: criado analisador operacional Python isolado, com testes unitários para tarefas atrasadas, oportunidades paradas e compromissos do dia; sem integração com o Proelium Operacional.

- Privacidade de identidade: removidos textos, dedicatórias e referências nominais antigas da interface e dos cenários demonstrativos; registros operacionais continuam preservados.

- Identidade visual: removidas referências à marca anterior, a logo correspondente e os textos históricos associados; dados operacionais permanecem preservados. Cache do shell atualizado para v206.

- Bot funcional completo: o cenário isolado agora simula contato, proposta, venda, cliente, projeto, operação, pós-venda, compras, financeiro, qualidade, equipamentos, diagramas, permissões e conflitos sem acessar o PostgreSQL ou os dados reais; gera relatório de correções e é executado após o deploy.

- Presença e textos do servidor: corrigidas mensagens com codificação UTF-8 quebrada e adicionado teste de regressão; o cache do shell foi atualizado para distribuir a correção.

- Qualidade operacional: criado um bot de smoke test somente leitura para conferir saúde, armazenamento, shell PWA, proteção da API e, opcionalmente, autenticação e leitura sincronizada; o deploy no VPS agora só conclui após a aprovação automática do bot.
- Identidade visual: padronizado o nome da logo completa oficial para `assets/proelium-logo-oficial.png`, com referências atualizadas no shell web e cache do PWA renovado.
- Identidade visual: aplicada a paleta oficial Proelium no login, cabeçalho, navegação, botões, cards e estados ativos, com tema do PWA atualizado para verde escuro e fundo claro oficiais.

- Android: adicionado o gerador local `Gerar-APK-Android.ps1`, que usa o Java 17 baixado em Downloads e entrega o APK instalável 1.4 com a logo oficial.

- Windows: preparado o instalador 0.1.3 e a versão portátil com o ícone oficial colorido da Proelium.

- Android: preparada a versão 1.4 do instalador com o símbolo oficial colorido da Proelium como ícone do aplicativo.

- Oportunidades: incluído o botão para criar quatro exemplos fictícios de teste, distribuídos entre novo contato, qualificação, visita e orçamento. Eles seguem o fluxo normal e não criam clientes até a aprovação.

- Biblioteca técnica: incluídos modelos iniciais de rede, áudio, vídeo e cabeamento com portas, demandas, limites e valores comerciais de referência em reais. Os preços foram posicionados acima da média e continuam exigindo validação de fornecedor antes da proposta.

- Biblioteca técnica: adicionados fabricantes iniciais para Ubiquiti/UniFi, JBL, Denon, Optoma, Revel, Sonos, Soho Plus, Santo Angelo, Bowers & Wilkins e Focal. Cada fabricante pode ter fonte oficial, situação de validação e inclusão de modelos próprios.

- Conexões de produtos: cada modelo agora registra fonte oficial, situação de validação, interfaces compatíveis, demandas obrigatórias e limites de uso. Essas regras permanecem apenas como referência até serem validadas; nenhuma ligação ou compra é criada automaticamente.

- Levantamento: cada necessidade agora pode registrar a tecnologia a orçar. Esta definição técnica, sem marca ou preço, será a ponte entre a necessidade do cliente e as futuras sugestões de produtos, cabos, orçamento e diagrama.

- Orçamentos: propostas não aprovadas agora podem ser excluídas com seus ambientes e pendências de cotação, mantendo recuperação pela Auditoria. Propostas aprovadas permanecem preservadas para não quebrar o vínculo com cliente e projeto.

- Levantamento: ambientes agora podem ser renomeados preservando seus itens internos. Os itens exibem edição e exclusão confirmada diretamente dentro do ambiente.

- Orçamentos: adicionada edição direta da proposta (nome, validade e observações) e exclusão confirmada de itens. Quantidades e descontos continuam ajustáveis em cada ambiente, sem alterar os cálculos de custo, venda e margem.

- Levantamento: a seleção de objetos foi ampliada e agrupada por função de uso — rede, automação, iluminação, áudio e vídeo, segurança, motorização e infraestrutura. A escolha é genérica nesta etapa; marca, modelo e conexões continuam para Produtos e Serviços e orçamento.

- Marca: cache renovado para propagar a assinatura e o símbolo oficiais da Proelium em vez das imagens anteriores.

- Oportunidades: a entrada comercial foi renomeada de “Comercial” para “Oportunidades”. O fluxo agora orienta e exige levantamento vinculado antes da criação do orçamento; cliente e projeto seguem sendo criados apenas na aprovação da proposta.

- Comercial: oportunidades concluídas agora exibem ações de gerenciamento. Perdas podem voltar para Qualificação, e oportunidades podem ser excluídas com recuperação pela Auditoria; clientes, projetos e orçamentos aprovados permanecem preservados.

- Comercial: corrigido o clique de exclusão na tabela de oportunidades concluídas, isolando-o das ações do funil.

- Comercial: a recuperação de oportunidades é inicializada automaticamente antes da exclusão, evitando que registros antigos impeçam a remoção.

- Levantamento: adicionada exclusão confirmada, com remoção dos pontos vinculados e registro na Auditoria. Quando ainda não existir proposta, agora é possível criar o orçamento vinculado e enviar os ambientes em uma única ação.

- Ícone: navegador e PWA usam o símbolo oficial da Proelium.

- Aplicativos nativos: Android 1.3 e Windows 0.1.2 passam a usar o símbolo oficial como ícone de instalação.

- Fluxo comercial: Levantamento agora ocupa de forma explícita o passo entre Comercial e Orçamentos no menu.

- Marca oficial v208: substituídos os arquivos de imagem pela assinatura colorida e pelo símbolo técnico enviados nesta revisão; cache atualizado para forçar o download no navegador e no PWA.

- Marca oficial: adotadas as versões aprovadas da Proelium Serviços — assinatura completa para áreas principais e símbolo técnico para espaços compactos; cache atualizado para propagar a identidade em todos os aparelhos.

- Identidade visual: aplicada a marca Proelium fornecida pela empresa, com o símbolo de conexões nos espaços compactos e a assinatura completa em abertura, login, cabeçalho e modo privacidade.


- Status de aprovaÃ§Ã£o: a aprovaÃ§Ã£o de cliente e projeto agora Ã© registrada na auditoria e aparece no status do menu apÃ³s a sincronizaÃ§Ã£o.

- Zoom no celular: adicionado cadeado para alternar entre zoom bloqueado e zoom por pinÃ§a na tela mÃ³vel.

- OrÃ§amentos: removido o botÃ£o de substituiÃ§Ã£o das caixas Morel ao lado da aprovaÃ§Ã£o do cliente e projeto.

- OrÃ§amentos: removidos da interface os controles de item geral e rateio pelo projeto; registros existentes permanecem preservados.

- RelÃ³gio sincronizado: o cabeÃ§alho usa o horÃ¡rio do servidor, mantendo PC e celular alinhados mesmo com diferenÃ§as no relÃ³gio local.

- PresenÃ§a detalhada: ao lado do participante aparecem os tipos de aparelho em uso e a quantidade de acessos simultÃ¢neos.

- Status no menu: o app mostra a versÃ£o instalada e a Ãºltima sincronizaÃ§Ã£o com o servidor.

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
- Correção móvel: isolada a marca do modo privacidade das regras do cabeçalho; menu e controle de privacidade voltam a permanecer acessíveis;
- Modo privacidade no celular: posição da logo central equilibrada após a composição com a ilustração;
- BI de desempenho remodelado: terminal de obras com mini-curvas por projeto, filtros e análise detalhada de execução, custo, prazo, margem e discrepâncias ao selecionar uma obra;
- Bloco 6 concluído como MVP: ativos instalados vinculados a cliente/projeto, ordens de serviço sincronizadas à agenda, chamados de pós-venda e histórico técnico do cliente;
- OS integrada como centro de rastreabilidade: vincula cliente, projeto, orçamento aprovado, checklist, ativo técnico, relatório de campo e entrega/aceite;
- Bloco 7 iniciado: lançamentos financeiros de receita, despesa, pagamento e recebimento; comparação previsto × realizado e BI com filtros por período, cliente, responsável e categoria.
- Bloco 7 validado: correção no cálculo dos lançamentos; teste de custo realizado e reflexo no BI executado e removido do banco compartilhado.
- Bloco 5 iniciado: ficha de execução por projeto com avanço de etapas, checklist, tarefas, relatórios de serviço e conexão com a instalação vinculada;
- Bloco 5 concluído como MVP: checklist padrão aplicável aos projetos, atualização automática para novos projetos e entrega formal com aceite do cliente;
- Assinatura da Proelium no rodapé do computador movida para a área clara, após o menu lateral;
- Proteção de inicialização adicionada: a tela de dedicatória é fechada automaticamente mesmo se algum módulo complementar falhar; cache do aplicativo atualizado;
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
- logo do cabeçalho móvel recebeu ampliação adicional;
- cabeçalho móvel reorganizado com data e relógio mais baixos para dar maior presença à marca;
- controle de intensidade da arte no celular reorganizado em duas linhas para evitar sobreposição;
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
- corrigido o cadastro compartilhado de Waldemir.

> Os dados vivos do catálogo, colaboradores e demais cadastros ficam no servidor compartilhado (`data/shared-data.json`) e não são enviados ao Git por conterem informações operacionais. O Git registra o código, a documentação e a estrutura padrão.

## 0.4.0 — 2026-08-15

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
# Próxima entrega

- Adicionado relatório consolidado de desempenho na execução de cada projeto, reunindo andamento, checklist, pendências, custos reais, registros de campo, instalação e entrega.
- Identidade visual: splash e login passaram a usar o logotipo vetorial Proelium Serviços e a paleta das telas oficiais de referência.
- Identidade visual: ícone do PWA, favicon e indicador de versão alinhados à nova marca e ao cache v208.
- Segurança: o servidor agora recusa iniciar em produção sem `SESSION_SECRET` forte configurado.
- Segurança: mutações autenticadas da API agora validam a origem da solicitação quando o navegador envia o cabeçalho `Origin`.
- Segurança: respostas da API, arquivos públicos e eventos em tempo real passaram a enviar cabeçalhos HTTP básicos de proteção.
- Segurança: login protegido contra tentativas repetidas, com bloqueio temporário após cinco falhas.
- Financeiro: criada a base relacional para contas e transações externas, separada dos lançamentos manuais e sem armazenamento de credenciais bancárias.
- Documentação: criado documento separado para o projeto interno de bots e testes automatizados.
- Organização: scripts e testes específicos do bot foram movidos para `bot-testes/`, fora das pastas do software principal.
- Identidade visual: tela de login passou a usar o arquivo de logo derivado da referência fornecida.
- Deploy: workflow ajustado para sincronizar os bots a partir da nova pasta `bot-testes/`.
- Deploy: migração de contas financeiras ajustada para funcionar no armazenamento runtime atual.
- Deploy: bots passaram a ser publicados e executados em `bot-testes/scripts`, respeitando a separação do projeto de testes.
- Deploy: criação automática da pasta remota dos bots antes da sincronização.
- Identidade visual: logo da tela de login ampliada e cache atualizado para v210.
# Próxima entrega

- Apresentação: README revisado para funcionar como vitrine pública do projeto, com proposta de valor, stack, segurança, acesso, limites conhecidos e documentação de referência.
# 2026-09-01

- Rodapé e menu: logo afastada da barra de sincronização no celular; botão do menu ocultado somente pelo clique/gesto que abre a navegação.
- Testes comerciais: gerador local ampliado para criar 10 oportunidades demonstrativas em diferentes etapas do fluxo.
- Menu mobile: botão começa oculto durante o carregamento e só é exibido após a interface estar pronta; ao abrir, é removido imediatamente.
- Menu mobile: o estado oculto do botão agora força `display:none`, evitando que a regra visual do botão atrase ou impeça seu desaparecimento ao abrir o menu.
- Menu mobile: removida a regra que deixava o botão flutuante circular; o controle permanece semiquadrado, com cantos arredondados.
- Menu mobile: o botão flutuante agora é ocultado diretamente enquanto a navegação estiver aberta, evitando que ele apareça sobre o primeiro item do menu.
# Próxima entrega

- Painel de análise restrito aos administradores da plataforma.
- Painel administrativo para revisar, aprovar ou rejeitar empresas cadastradas.
- Selo visual `BETA` no menu para módulos em desenvolvimento.
- Onboarding empresarial após autenticação Google, com preenchimento automático do responsável.
- Usuário Google novo direcionado ao cadastro de empresa, com CNPJ único e análise inicial.
- Acabamento final do botão Google com ícone oficial e estados de foco e interação.
- Botão “Entrar com Google” alinhado ao padrão visual atual do Google.
- Login complementar com Google OAuth, vinculado ao e-mail do usuário Proelium.
- Cadastro de empresas com primeiro administrador.
- Rotinas próprias por empresa, com descrição, periodicidade e checklist.
- Separação inicial de rotinas por empresa no armazenamento JSON e PostgreSQL.
- Corrigida a compatibilidade do schema PostgreSQL para instalações antigas que não tinham a coluna de e-mail dos usuários Google.
## Próxima entrega

- Corrigida a persistência PostgreSQL do tipo de perfil, mensagem preliminar e status da licença.
- O acesso limitado e a licença pendente agora ficam sinalizados na sessão do usuário.
- Corrigida a autorização do administrador limitado: o usuário não recebe mais todos os módulos apenas por possuir o papel administrativo.
- Corrigido o encerramento do onboarding Google: a sessão e os dados são carregados antes de fechar a tela de cadastro, evitando o loop.
- Completado o esquema PostgreSQL de empresas com responsável, telefone e status, eliminando a falha que impedia finalizar o cadastro.
- Mantido o acesso público exclusivamente pelo Google; usuário e senha internos não são exibidos como porta de entrada do produto.
- Adicionado teste de regressão do onboarding Google, cobrindo cadastro da empresa, criação da sessão e entrada na API do app.
- Removido o bloqueio silencioso de campos complementares no onboarding; somente a identificação crítica impede o envio e qualquer erro passa a ser exibido pelo app.
- Preservado o tipo de participante como campo oculto após a escolha do perfil, garantindo que o envio use o fluxo correto de cadastro Google.
- Corrigido o cálculo dos dígitos verificadores do CNPJ; a validação passa a usar os pesos oficiais da Receita Federal.
- Ajustado o CNPJ sintético do teste funcional para um número matematicamente válido, evitando falso negativo no fluxo de cadastro Google.
## 2026-09-03

- Adicionado `npm run test:ui-flow`, um bot Playwright de uso real que executa o ciclo comercial completo pela interface em uma empresa temporária vazia, sem acionar a carga demonstrativa.
- Removida a carga automática de dados DEMO em empresas vazias; exemplos comerciais só entram quando o administrador aciona o botão de demonstração.
- Corrigido o primeiro carregamento de empresas: a tela não exibe números provisórios da base de desenvolvimento antes da sincronização.
- Adicionado `Exportar tabela` ao catálogo de Produtos e serviços; o CSV usa somente os produtos e serviços do ambiente da empresa atual.
- Reorganizado o menu por áreas: Comercial, Projetos 360°, Pós-venda, Gestão, Pessoas e conta da empresa.
- Criado o centro Projeto 360° com resumo do orçamento aprovado, cronograma, execução, compras e pós-venda vinculados à mesma obra.
## 2026-09-03

- OAuth Google local: o `state` da autenticação agora fica protegido também em cookie temporário assinado, evitando que um reinício do servidor local invalide uma tentativa legítima de login sem relaxar a proteção contra CSRF ou replay.
- Comercial: removidos os atalhos de avanço manual e carga de exemplos do ambiente empresarial; a criação do orçamento agora exige levantamento validado com pontos ou quantitativos registrados.
- Comercial: oportunidades agora permitem registrar atividades com responsável, data, horário e observação; o compromisso fica vinculado à oportunidade e aparece na Agenda operacional como lembrete.
- Comercial: atividades vinculadas a oportunidades passaram a integrar o escopo de dados comercial, mantendo a permissão por empresa também para perfis comerciais limitados.
- Clientes: novos cadastros e aprovações de oportunidades são bloqueados quando documento, e-mail ou telefone já pertencem a outro cliente da empresa; registros existentes permanecem preservados.
- Comercial: funil ganhou indicadores de valor em aberto, valor ganho, conversão, ticket médio e ações atrasadas.
- Orçamentos: aprovação bloqueia propostas sem margem bruta positiva, inclusive ao alterar diretamente a situação para Aprovado; descontos continuam limitados entre 0% e 100%.
- Propostas: análise do orçamento ganhou impressão para salvar em PDF pelo navegador, aceite explícito do cliente e registro de recusa com motivo e data.
- Oportunidades: tela passou a representar exclusivamente prospecção e interações; o resumo de orçamentos por ambiente foi removido, mantendo propostas na área própria.
- Oportunidades: visual simplificado para relacionamento e interesses futuros, com métricas de contatos e próximas interações; referências financeiras e atalhos de orçamento foram retirados dos cartões.
- Oportunidades: indicadores agora refletem apenas prospecção e relacionamento; oportunidades concluídas saem do mapa ativo, sem apagar o cliente, permitindo novas oportunidades para clientes e projetos existentes.
- Teste de interface: o bot comercial passou a criar 30 oportunidades de prospecção por formulários reais, mantendo a empresa temporária sem carga comercial prévia.
