# Proelium Operacional

Protótipo experimental de CRM, orçamentos e operação da Proelium, preparado para testes privados e futura integração com o N.E.M.O.

## Estado atual

- CRM com cadastro, edição, exclusão e histórico de clientes;
- catálogo de produtos e serviços;
- orçamentos organizados por cômodos/ambientes;
- projetos nas etapas Projeto técnico, Cabeamento e Instalação;
- tarefas, operação, financeiro, equipamentos e conhecimento;
- painel de Business Intelligence;
- PWA instalável em Windows, Android e iOS;
- servidor local em `http://localhost:4173`;
- acesso remoto privado por Tailscale Serve;
- dados compartilhados em `data/shared-data.json`;
- sincronização automática entre os aparelhos conectados ao mesmo servidor;
- controle de revisão para impedir que uma tela antiga sobrescreva alterações recentes.

## Executar

No PC servidor, execute `Reiniciar-App.ps1` e mantenha a janela aberta. O script encerra com segurança uma versão antiga que esteja usando a porta 4173 e inicia a versão atual. Depois acesse `http://localhost:4173`.

Consulte [RODAR-AGORA.md](RODAR-AGORA.md) para acesso remoto e instalação nos dispositivos.

## Documentação

- [MVP e regras do produto](docs/MVP.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Operação do servidor](docs/OPERATIONS.md)
- [Sincronização entre aparelhos](docs/SYNCHRONIZATION.md)
- [Encerramento da Etapa 0](docs/STATUS-2026-08-14.md)
- [Plano de retomada e divisão de trabalho](docs/PLANO-AMANHA.md)
- [Fluxo de desenvolvimento e Git](docs/GIT-WORKFLOW.md)
- [Contrato futuro da API](docs/API.md)
- [Decisões técnicas](docs/DECISIONS.md)
- [Histórico de versões](CHANGELOG.md)

## Publicar atualizações

Execute `Publicar-GitHub.ps1`. O assistente mostra os arquivos alterados, solicita confirmação, valida o JavaScript, cria o commit e envia a branch atual ao GitHub. O arquivo `data/shared-data.json` permanece fora do Git.

## Atenção

Esta é uma base experimental. Há proteção básica contra sobrescrita simultânea, mas ainda não existem login, permissões ou banco transacional. Use dados de teste e faça backup do arquivo compartilhado.
