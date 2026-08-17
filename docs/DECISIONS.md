# Decisões técnicas

## ADR-001 — Protótipo sem framework

O MVP usa HTML, CSS e JavaScript sem dependências externas para reduzir instalação e permitir validação rápida.

## ADR-002 — PC como servidor experimental

O PC `homehell` hospeda temporariamente o app. Essa solução é adequada para testes, mas não para produção.

## ADR-003 — Tailscale para acesso privado

O acesso remoto usa Tailscale Serve, evitando abertura direta de portas no roteador. A porta publicada é 4173.

## ADR-004 — Arquivo compartilhado temporário

Os dados ficam em `data/shared-data.json`. A decisão reduz desenvolvimento inicial. O servidor controla revisões para impedir sobrescrita silenciosa, mas ainda não oferece autenticação, transações ou mesclagem automática de duas alterações simultâneas.

## ADR-007 — Sincronização híbrida no protótipo

O servidor envia eventos em tempo real por SSE. O navegador também consulta `/api/data` a cada 5 segundos e quando volta ao primeiro plano. Essa contingência atende navegadores móveis e instalações PWA, enquanto `revision` e `baseRevision` impedem que uma cópia antiga substitua silenciosamente dados mais recentes.

## ADR-008 — Uma única origem operacional

Todos os dispositivos devem usar `https://homehell.tail99a9b2.ts.net`, encaminhado exclusivamente para `http://127.0.0.1:4173`. `localhost`, `127.0.0.1`, porta 5500 e Live Server não são endereços válidos para colaboradores.

## ADR-009 — Agenda interna antes da integração externa

A primeira versão da agenda é gerada pelos dados internos de tarefas, instalações e próximas ações comerciais. Isso mantém cliente, projeto e responsável como fonte única. Uma integração futura com Google Calendar ou Outlook deverá publicar esses compromissos para os calendários pessoais, sem criar uma segunda base de dados.

## ADR-005 — Dados fora do Git

O arquivo compartilhado é ignorado pelo Git para evitar versionar informações privadas. O código e a documentação são versionados; os dados recebem backup separado.

## ADR-006 — Evolução orientada pelo uso

Novas funções serão priorizadas após observação do uso real. A próxima etapa organizacional será definir responsáveis e pacotes de serviço.

## ADR-010 — PostgreSQL com contrato agregado compatível

O PostgreSQL passa a ser a fonte principal do estado operacional e dos usuários. Nesta primeira etapa, o documento agregado e sua revisão são armazenados em `jsonb`, com transação, bloqueio de concorrência e histórico imutável. Isso preserva os aplicativos atuais durante a migração. A normalização do modelo será gradual; o espelho JSON permanece temporariamente como contingência e não substitui os backups do banco.
