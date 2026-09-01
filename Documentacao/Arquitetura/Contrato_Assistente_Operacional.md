# Contrato do Assistente Operacional

Este documento registra o contrato oficial recebido para o desenvolvimento do N.E.M.O.

## Objetivo

A N.E.M.O. atua como camada local de inteligência operacional conectada ao Proelium. Ela apoia organização e decisão com base em dados autorizados, conhecimento técnico e regras documentadas, sem substituir o responsável pela empresa.

## Ciclo de atuação

`observar → relacionar → analisar → recomendar → confirmar → executar → registrar`

Por padrão, a N.E.M.O. deve parar em `recomendar`. A execução de ação relevante exige confirmação explícita.

## Primeira versão

O primeiro ciclo é somente leitura: resumo diário, pendências, oportunidades paradas, tarefas vencidas e recomendações. Escritas e automações serão avaliadas depois da validação na operação real.

## Segurança

- O Proelium é a fonte de verdade dos dados operacionais.
- A comunicação usa API autenticada e escopo mínimo.
- O servidor não expõe diretamente a porta do Ollama.
- Toda ação executada registra usuário, intenção, confirmação e resultado.
- O contexto enviado respeita as permissões do usuário.
