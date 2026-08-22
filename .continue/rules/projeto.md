---
description: Regras especificas do projeto Proelium Operacional
alwaysApply: true
---

# Proelium Operacional - regras do projeto

Estas regras complementam as regras globais da IA desenvolvedora. Elas devem ser aplicadas somente neste repositorio.

## 1. Objetivo do projeto

O Proelium Operacional e o sistema interno da Proelium para apoiar CRM, orcamentos, projetos, operacao, financeiro, equipamentos, conhecimento, indicadores e gestao interna.

O repositorio e a fonte de verdade para implementacao. Nao transportar regras, processos ou estruturas de outros projetos sem validacao explicita.

## 2. Stack atual

- Runtime: Node.js
- Persistencia principal: PostgreSQL
- Frontend atual: HTML, CSS e JavaScript existentes no repositorio
- Execucao local: `npm start`
- Validacao principal: `npm run check`

Respeitar a arquitetura e os padroes ja existentes antes de introduzir novas dependencias ou frameworks.

## 3. Fluxo obrigatorio antes de alterar codigo

Antes de editar:

1. localizar os arquivos diretamente relacionados a tarefa;
2. ler o README e a documentacao relevante quando necessario;
3. identificar dependencias e efeitos colaterais;
4. propor apenas a alteracao minima necessaria;
5. evitar mudancas fora do escopo solicitado.

Nao carregar ou analisar o repositorio inteiro quando a tarefa puder ser resolvida por modulo.

## 4. Seguranca e areas sensiveis

Exigir autorizacao explicita antes de qualquer alteracao que envolva:

- banco de dados ou migracoes destrutivas;
- autenticacao, usuarios ou permissoes;
- exclusao ou sobrescrita de dados;
- arquitetura central;
- producao, VPS ou deploy;
- Git push, force push, reset ou reescrita de historico;
- segredos, tokens, senhas ou chaves.

Nunca adicionar ao Git arquivos de dados compartilhados, backups, credenciais, tokens ou segredos.

## 5. Ambiente de desenvolvimento

O ambiente principal e Windows com PowerShell.

- Preferir ferramentas internas de leitura, busca e edicao do Continue.
- Usar comandos PowerShell quando o terminal for realmente necessario.
- Nao usar comandos Bash/Linux como `sed`, `grep`, `cat`, `rm` ou `ls -la` como alternativa automatica.
- Nao usar terminal para editar arquivos quando a ferramenta de edicao estiver disponivel.

## 6. Ferramentas do Continue

Para arquivos existentes:

- leitura: `read_file`;
- edicao: `edit_existing_file`;
- substituicao exata: `single_find_and_replace`;
- verificacao de alteracoes: `view_diff`.

Para arquivos novos:

- usar `create_new_file`.

Nao procurar ferramentas inexistentes como `edit_file` ou `write_file` quando as ferramentas acima estiverem disponiveis.

Se a mesma ferramenta falhar duas vezes consecutivas, interromper a repeticao, diagnosticar a causa e mudar de estrategia.

## 7. Persistencia da tarefa

Uma tarefa permanece ativa ate que todos os entregaveis solicitados tenham sido concluidos ou exista um bloqueio real.

Nao abandonar uma tarefa incompleta com mensagens genericas pedindo uma nova funcionalidade.

Antes de finalizar:

1. conferir o pedido original;
2. verificar o que foi concluido;
3. verificar o que ainda esta pendente;
4. continuar automaticamente quando ainda houver trabalho dentro do escopo.

Em tarefas longas, trabalhar por blocos e modulos para preservar contexto.

## 8. Analise, auditoria e documentacao

Quando o pedido for analisar, mapear, revisar, auditar ou documentar:

- permanecer em modo somente leitura, salvo autorizacao expressa para editar;
- diferenciar informacao confirmada de inferencia;
- indicar os arquivos usados como fonte;
- nao inventar funcionalidades ou comportamento;
- nao transformar uma auditoria em implementacao sem solicitacao.

## 9. Edicao e validacao

Quando a tarefa autorizar edicao:

1. ler o arquivo antes de editar;
2. fazer a menor mudanca possivel;
3. revisar o diff;
4. executar os testes adequados;
5. informar claramente o que foi alterado, testado e o que ficou pendente.

Somente declarar um arquivo como alterado quando a edicao tiver sido realmente executada.

Para validacao geral do projeto, usar:

```powershell
npm run check
```

## 10. Git e entrega

Nao fazer commit ou push sem autorizacao explicita do usuario.

Antes de um commit:

1. revisar `git status`;
2. revisar o diff;
3. executar os testes aplicaveis;
4. garantir que apenas arquivos relacionados a tarefa estejam incluidos.

Preferir commits pequenos e objetivos, usando prefixos como `feat:`, `fix:`, `docs:`, `chore:` ou `refactor:`.

## 11. Prioridades de qualidade

Priorizar, nesta ordem:

1. preservar dados e comportamento existente;
2. seguranca;
3. correcao funcional;
4. alteracoes pequenas e reversiveis;
5. testes e validacao;
6. clareza do codigo;
7. documentacao;
8. performance quando relevante.

Nao fazer refatoracoes amplas sem necessidade direta para a tarefa atual.
