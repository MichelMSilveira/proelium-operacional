# Projeto do Produto — Proelium Operacional

## 1. Identidade do produto

O Proelium Operacional é uma plataforma de gestão operacional para empresas que prestam serviços técnicos e executam projetos. O produto organiza, em um único sistema, o relacionamento com clientes, a venda, o planejamento, a execução, os custos, os equipamentos, as pessoas, o conhecimento e os indicadores da operação.

Este documento é o mapa oficial do produto. Ele define o que o Proelium Operacional é, para quem existe, quais capacidades deve entregar e como seus módulos se conectam. Não é manual de uso, documentação de código nem plano de migração tecnológica.

## 2. Problema que o produto resolve

Empresas de serviços técnicos costumam espalhar informações entre mensagens, planilhas, documentos, sistemas financeiros e conhecimento individual dos profissionais. Isso dificulta saber quem é o cliente, o que foi prometido, qual projeto está em andamento, quem é responsável, quais materiais estão envolvidos e qual foi o resultado financeiro.

O Proelium cria uma fonte única, rastreável e compartilhada para transformar atendimento em projeto, projeto em execução e execução em relacionamento de longo prazo.

## 3. Público e perfis

Atende empresas de instalação, integração, automação, redes, segurança, áudio e vídeo, infraestrutura e outros serviços técnicos organizados por projetos.

- Administrador: configura empresa, usuários, permissões e processos.
- Comercial: gerencia clientes, oportunidades, contatos, orçamentos e aprovações.
- Operação: acompanha projetos, tarefas, agenda, ordens de serviço, checklists e execução.
- Financeiro: acompanha receitas, despesas, compras, pagamentos, custos e margem.
- Leitura: consulta projetos, painéis e conhecimento sem alterar a operação.

## 4. Resultado que o produto deve entregar

A empresa deve conseguir responder rapidamente: quem é o cliente; o que ele precisa; o que foi orçado e aprovado; em que etapa está o projeto; quem deve fazer cada tarefa; quais materiais, equipamentos e documentos estão relacionados; quanto foi previsto, gasto e recebido; e o que precisa ser acompanhado depois da entrega.

## 5. Fluxo principal

`Lead → Cliente → Oportunidade → Orçamento → Aprovação → Projeto → Planejamento → Execução → Testes → Entrega → Pós-venda`

O fluxo permite novas oportunidades para clientes existentes, vários projetos por cliente ou local e histórico contínuo após a conclusão.

## 6. Módulos do produto

- **Acesso e identidade:** login, sessão, perfis, permissões, convites, usuários da empresa e perfil pessoal.
- **CRM e clientes:** cadastro, contatos, oportunidades, histórico, endereço, status e ficha 360°.
- **Levantamento técnico:** necessidades do cliente e do local, organizadas por automação, áudio e vídeo, conectividade, câmeras e acessos.
- **Orçamentos:** catálogo de produtos, materiais e serviços, ambientes, custos, preços, margem, proposta e aprovação.
- **Projeto 360°:** cliente, local, escopo, orçamento, prazo, etapas, cronograma, tarefas, compras, equipamentos, custos, documentos, execução, entrega e pós-venda.
- **Planejamento e cronograma:** fases, dias, equipe, horas, mão de obra, custo e prazo, separados do valor comercial aprovado.
- **Execução de campo:** tarefas, agenda, ordens de serviço, checklists, instalação, testes, pendências, relatórios e entrega.
- **Compras e materiais:** lista de obra, itens, origem no orçamento, consolidação, ambientes e status.
- **Equipamentos:** catálogo técnico, estoque, instalados, garantia, manutenção, fabricante e localização.
- **Financeiro:** receitas, despesas, compras, pagamentos, custos, resultado e margem prevista ou realizada.
- **Pessoas e avaliações:** colaboradores, parceiros, funções, especialidades, disponibilidade, histórico e avaliações.
- **Conhecimento:** artigos, documentos, tags, padrões e referências técnicas.
- **BI:** clientes, oportunidades, orçamentos, projetos, custos, margem, progresso, qualidade e desempenho.
- **Auditoria e sincronização:** histórico de alterações, responsável, revisões, sincronização e prevenção de sobrescrita.

## 7. Entidades centrais

Usuário, empresa, cliente, contato, local/imóvel, oportunidade, orçamento, ambiente, produto, serviço, projeto, etapa, tarefa, agenda, ordem de serviço, checklist, compra, equipamento, colaborador, avaliação, lançamento financeiro, documento, artigo e evento de auditoria.

Um cliente pode possuir vários locais e projetos. Um projeto pertence a um cliente e a um local, utiliza itens de orçamento, gera planejamento e execução e mantém histórico até o pós-venda.

## 8. Regras essenciais

- Registros possuem identificação estável, datas e responsável.
- Dados empresariais são isolados por empresa.
- Permissões limitam módulos e ações.
- Valores monetários preservam precisão.
- Alterações relevantes geram histórico ou auditoria.
- Tarefas vencidas e projetos bloqueados aparecem nos indicadores.
- O valor aprovado e o custo realizado permanecem distinguíveis.
- Exclusões relacionadas a histórico exigem proteção e confirmação.

## 9. Plataformas

É um app web responsivo, instalável como PWA e utilizado também pelos clientes Android e Windows. O servidor atual usa Node.js, a persistência principal usa PostgreSQL e a operação inclui API, autenticação, sincronização, testes e implantação em VPS.

## 10. Estado e documentação

O núcleo operacional já possui CRM, fluxo comercial, Projeto 360°, execução, financeiro, equipamentos, pessoas, conhecimento, BI, autenticação, permissões, auditoria, sincronização e testes. O estado detalhado está em `docs/STATUS.md`, `docs/MVP.md` e `docs/TEST-BOT-REPORT.md`.

## 11. Fronteiras

O Proelium Operacional não é uma rede social, portal de empregos, cadastro público de desempregados, plataforma genérica para todas as profissões ou assistente de IA. Esses assuntos só podem existir como produtos separados ou integrações formalmente decididas.

## 12. Fonte de verdade

Este documento define visão e escopo. `docs/MVP.md` detalha funções; `docs/API.md` detalha o contrato técnico; `docs/ARCHITECTURE.md` detalha arquitetura; `docs/STATUS.md` registra o estado atual; `docs/DECISIONS.md` registra decisões; código, banco, testes e documentação versionados completam a fonte de verdade.

## 13. Critérios de sucesso

- A equipe encontra o estado de um projeto em menos de 30 segundos.
- Toda pendência possui responsável e prazo.
- Orçamento, custo e margem são visíveis por projeto.
- Histórico de cliente, local, equipamentos e atendimento é consultável.
- O fluxo não depende apenas de texto livre ou memória individual.
- O produto pode evoluir sem perder dados nem comportamento validado.

## 14. Governança

Não versionar dados reais, senhas, tokens, chaves, backups ou artefatos privados. Não transportar regras de outros projetos sem validação. Alterações de banco, autenticação, produção ou comportamento central exigem testes, documentação e revisão de impacto.
