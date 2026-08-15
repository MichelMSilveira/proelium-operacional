# Plano de retomada

## Objetivo da rodada 1

Definir e testar os fluxos antes de ampliar o código. Cada responsável registra campos, regras, exemplos e problemas encontrados. A rodada termina com uma revisão cruzada.

## Natália — Bloco 1: CRM e clientes

### Escopo

- cadastro, edição, consulta e exclusão de clientes;
- contatos, telefones, e-mails e documentos;
- endereços e locais de instalação;
- observações e preferências;
- histórico do cliente;
- busca, filtros e confirmação de exclusão.

### Entrega da primeira rodada

1. Testar cadastro, edição e exclusão no iPhone e no computador.
2. Listar os campos obrigatórios, opcionais e ausentes.
3. Criar dois exemplos reais sem informações sensíveis.
4. Registrar dificuldades e sugestões.
5. Não alterar servidor, sincronização, Tailscale ou estrutura do Git.

## Michel — Bloco 2: comercial e contatos

### Escopo

- entrada de contatos e oportunidades;
- origem do contato;
- responsável pelo atendimento;
- etapas contato, qualificação, visita e orçamento;
- próxima ação e prazo;
- conversão do contato em cliente;
- motivo de perda e histórico comercial.

### Entrega da primeira rodada

1. Desenhar o fluxo do primeiro contato até o orçamento. ✅
2. Definir os campos de uma oportunidade. ✅
3. Criar exemplos de oportunidade ganha, em andamento e perdida.
4. Definir quais informações passam automaticamente para o CRM. ✅
5. Não iniciar orçamento por cômodo nesta rodada.

### Mínimo funcional entregue

- cadastro de nova oportunidade;
- etapas Novo contato, Qualificação, Visita, Orçamento, Ganho e Perdido;
- origem, responsável, próxima ação, prazo, valor estimado e motivo de perda;
- avanço manual de etapa;
- conversão da oportunidade em cliente potencial;
- painel de oportunidades concluídas e manutenção da lista de orçamentos por ambiente.

## Regra para trabalhar separados

- Natália trabalha somente no Bloco 1.
- Michel trabalha somente no Bloco 2.
- Antes de editar código, cada pessoa registra a proposta em documentação.
- Não executar `Publicar-GitHub.ps1` ao mesmo tempo nos dois computadores.
- A publicação é feita pelo PC principal após a revisão conjunta.
- Dados reais de clientes nunca entram no GitHub.

## Revisão cruzada

Ao final da rodada:

1. Michel testa o fluxo definido por Natália.
2. Natália testa o fluxo definido por Michel.
3. Cada pessoa registra dúvidas sem apagar a proposta original.
4. Os dois aprovam os campos mínimos.
5. Somente então começa a rodada de implementação.

## Checklist de início

- [ ] PC servidor ligado;
- [ ] `Reiniciar-App.ps1` executando;
- [ ] Tailscale conectado;
- [ ] aplicativo aberto pelo endereço `.ts.net`;
- [ ] Git sem alterações pendentes;
- [ ] responsáveis confirmados;
- [ ] exemplos de teste sem dados sensíveis.
