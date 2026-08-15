# Histórico de versões

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
