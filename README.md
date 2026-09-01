# Proelium Operacional

Plataforma operacional web para conectar CRM, orçamento, projetos, execução em campo, financeiro e indicadores em um único fluxo.

Este repositório é uma demonstração de produto e engenharia: uma aplicação full-stack construída de forma incremental, com frontend sem framework, API Node.js, persistência PostgreSQL e cliente PWA/desktop compartilhando a mesma interface.

## Por que este projeto existe

O Proelium transforma o caminho entre primeiro contato, levantamento técnico, orçamento, aprovação, instalação e pós-venda em uma operação rastreável. O foco é reduzir informação espalhada, preservar histórico e tornar decisões comerciais e técnicas visíveis para toda a equipe.

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

## Segurança e acesso

- login por usuário e senha;
- senhas armazenadas somente como hash `scrypt` com salt individual;
- sessão assinada em cookie `HttpOnly`, com `SameSite=Lax` e `Secure` em produção;
- bloqueio temporário após tentativas repetidas de login;
- autorização por papel (`admin`, `comercial`, `operacao`, `financeiro` e `leitura`);
- dados de produção, usuários e segredos excluídos do Git.

O fluxo completo está descrito em [Autenticação e acesso](docs/GUIA-ACESSO-E-INSTALACAO.md) e no [contrato da API](docs/API.md).

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

## Limites conhecidos

- a interface ainda usa o contrato agregado `/api/data`; a API versionada por recurso está documentada como evolução;
- sessões emitidas permanecem válidas até expirar ou receber logout, mesmo que o usuário seja desativado;
- o modo `file:` existe para demonstrações locais e não deve ser usado como ambiente de produção;
- a implantação exige configurar os secrets do VPS no GitHub Actions.

## Usuários

O sistema agora usa login por usuário e senha. Os usuários ficam em `data/users.json`, fora do Git. Para criar ou atualizar um usuário no servidor, execute `node auth-admin.js <usuario> admin` ou `node auth-admin.js <usuario> operador`; a senha é solicitada de forma interativa e armazenada somente como hash.
