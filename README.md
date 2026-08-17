# Proelium Operacional

Protótipo experimental de CRM, orçamentos e operação da Proelium, preparado para testes privados e futura integração com o N.E.M.O.

## Estado atual

- CRM com cadastro, edição, exclusão e histórico de clientes;
- catálogo de produtos e serviços;
- orçamentos organizados por cômodos/ambientes;
- projetos nas etapas Projeto técnico, Cabeamento e Instalação;
- tarefas, operação, financeiro, equipamentos e conhecimento;
- painel de Business Intelligence;
- terminal de desempenho por projeto, com análise de margem, resultado, execução e custos;
- avaliações internas e de clientes sobre qualidade, atendimento, compromisso e prazo;
- quadro de colaboradores e parceiros;
- controles de acessibilidade visual: ampliação de letras e alto contraste por aparelho;
- PWA instalável em Windows, Android e iOS;
- servidor local em `http://localhost:4173`;
- acesso remoto privado por Tailscale Serve;
- dados compartilhados em PostgreSQL, com histórico de revisões e espelho JSON temporário;
- sincronização automática entre os aparelhos conectados ao mesmo servidor;
- controle de revisão para impedir que uma tela antiga sobrescreva alterações recentes.

## Executar

No PC servidor, execute `Reiniciar-App.ps1` e mantenha a janela aberta. O script encerra com segurança uma versão antiga que esteja usando a porta 4173 e inicia a versão atual. Depois acesse `http://localhost:4173`.

Consulte [RODAR-AGORA.md](RODAR-AGORA.md) para acesso remoto e instalação nos dispositivos.

## Documentação

- [Guia de acesso e instalação em Windows, Android e iOS](docs/GUIA-ACESSO-E-INSTALACAO.md)
- [Encerramento operacional e estado atual](docs/ENCERRAMENTO-OPERACIONAL.md)
- [MVP e regras do produto](docs/MVP.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Operação do servidor](docs/OPERATIONS.md)
- [Sincronização entre aparelhos](docs/SYNCHRONIZATION.md)
- [Banco PostgreSQL, migrações e backups](docs/DATABASE.md)
- [Encerramento da Etapa 0](docs/STATUS-2026-08-14.md)
- [Plano de retomada e divisão de trabalho](docs/PLANO-AMANHA.md)
- [Fluxo de desenvolvimento e Git](docs/GIT-WORKFLOW.md)
- [Processo contínuo de entrega multiplataforma](docs/RELEASE-PROCESS.md)
- [Contrato futuro da API](docs/API.md)
- [Decisões técnicas](docs/DECISIONS.md)
- [BI, qualidade e reconhecimento](docs/BI-E-QUALIDADE.md)
- [Histórico de versões](CHANGELOG.md)

## Publicar atualizações

Execute `Entregar-Atualizacao.ps1 -Message "tipo: descrição"`. O comando valida o JavaScript, exige o registro no histórico, cria o commit e envia a branch atual ao GitHub. Em `main`, o GitHub Actions implanta a versão no VPS; PWA, Android e Windows passam a carregar a mesma interface publicada. O arquivo `data/shared-data.json` permanece fora do Git.

## Atenção

Esta é uma base experimental. Há proteção básica contra sobrescrita simultânea, mas ainda não há permissões detalhadas por módulo nem banco transacional. Use dados de teste e faça backup do arquivo compartilhado.

## Usuários

O sistema agora usa login por usuário e senha. Os usuários ficam em `data/users.json`, fora do Git. Para criar ou atualizar um usuário no servidor, execute `node auth-admin.js <usuario> admin` ou `node auth-admin.js <usuario> operador`; a senha é solicitada de forma interativa e armazenada somente como hash.
