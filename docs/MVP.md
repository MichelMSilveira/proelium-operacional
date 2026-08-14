# Especificação prática do MVP

## Objetivo

Dar à equipe uma fonte única para saber quem é o cliente, qual é o projeto, em que etapa está, o que precisa ser feito, quanto foi orçado/gasto e quais equipamentos e documentos estão relacionados.

## Perfis iniciais

- **Administrador:** configura usuários, processos e permissões.
- **Comercial:** clientes, oportunidades, orçamentos e aprovações.
- **Operação:** projetos, ordens de serviço, tarefas, checklists e equipamentos.
- **Financeiro:** receitas, despesas, compras, pagamentos e margem.
- **Leitura:** consulta painéis, projetos e conhecimento.

## Escopo da primeira versão

1. Clientes e contatos, com endereços e histórico.
2. Projetos relacionados a clientes, com etapa, responsável, prazo, orçamento e custo.
3. Processos modelados como etapas reutilizáveis.
4. Tarefas/pendências relacionadas a projeto, cliente ou ordem de serviço.
5. Oportunidades e orçamentos no fluxo comercial.
6. Ordens de serviço, agenda e checklists operacionais.
7. Lançamentos financeiros por projeto e categoria.
8. Equipamentos de estoque e instalados, incluindo garantia/manutenção.
9. Artigos e documentos da base de conhecimento, com tags.
10. Painel consolidado e trilha de auditoria.

## Ficha Cliente 360°

Cada cliente reúne cadastro, contatos, locais/unidades, projetos, instalações, equipamentos instalados, tarefas, valores e uma linha do tempo única. A linha do tempo registra contatos, visitas técnicas, propostas, pendências, manutenções e entregas, sempre com data e responsável.

A ficha permite excluir o cliente mediante confirmação explícita. No protótipo, a exclusão remove também projetos, tarefas, orçamentos, ambientes, instalações e histórico vinculados.

## Controle da instalação

Cada instalação pertence a um cliente, projeto e local. O fluxo técnico é `Projeto técnico → Cabeamento → Instalação`, com responsável, prazo, percentual de conclusão, equipamentos e pendências vinculadas.

## Fluxo do CRM

`Contatos → Orçamentos → Projetos → Acompanhamento`. O cadastro do cliente é atualizável e reúne documento, contato, e-mail, telefone, endereço, cidade, status e observações.

## Business Intelligence

O painel cruza clientes, orçamentos, projetos, custos, margem, progresso, etapas e responsáveis. A análise pode ser agrupada por cliente, etapa técnica ou responsável e mantém uma base detalhada para conferência.

## Orçamentos por cômodos

O catálogo central reúne produtos, materiais e serviços com código, categoria, modalidade, unidade, custo e preço. As modalidades são venda, disponibilização, venda ou disponibilização e serviço.

O catálogo inicial está organizado nas linhas UniFi para redes e câmeras, Scenario Embrace para automação, receivers Denon e caixas acústicas STAGE, Morel e B&W. Modelos, custos e preços devem ser preenchidos conforme a tabela comercial vigente. Produtos podem ser excluídos individualmente; a exclusão também retira o item dos ambientes de orçamento em que estiver sendo usado.

Cada orçamento é dividido em cômodos ou ambientes. Os itens são adicionados a um ambiente com quantidade e preservam custo e preço usados na proposta. O sistema calcula valor, custo, resultado e margem por ambiente e no orçamento completo, permitindo revisar a estratégia comercial antes do envio.

## Fluxo principal

`Lead → Cliente → Oportunidade → Orçamento → Aprovação → Projeto → Planejamento → Execução → Testes → Entrega → Pós-venda`

## Regras essenciais

- Todo registro possui ID estável, datas de criação/alteração e responsável.
- Valores monetários são armazenados em centavos.
- Exclusão deve ser lógica quando houver histórico relacionado.
- Mudanças de status geram eventos de auditoria.
- Tarefas vencidas e projetos bloqueados aparecem no painel.
- Dados do N.E.M.O. entram pela mesma API dos demais clientes, com usuário de serviço e permissões próprias.

## Fora do MVP

- emissão fiscal e conciliação bancária;
- roteirização automática;
- aplicativo móvel nativo e modo offline completo;
- automações autônomas do N.E.M.O.;
- integrações com ERP, WhatsApp ou fornecedores.

## Critérios de sucesso

- A equipe encontra o estado de um projeto em menos de 30 segundos.
- Cada pendência tem responsável e prazo.
- Orçado, custo realizado e margem são visíveis por projeto.
- Histórico de atendimento e equipamentos instalados são consultáveis por cliente.
- Nenhum dado central depende apenas de texto livre.
