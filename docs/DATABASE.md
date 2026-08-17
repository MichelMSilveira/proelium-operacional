# Banco de dados PostgreSQL

## Estado atual

O PostgreSQL é a fonte principal do estado operacional e dos usuários. A API pública permanece igual, portanto PWA, Android e Windows continuam usando `/api/data`, `/api/events` e as rotas de autenticação sem mudança de contrato.

Durante o período de conferência, cada gravação concluída no PostgreSQL também atualiza os arquivos JSON. Esses arquivos são apenas um espelho de contingência e não são a fonte principal quando `DATABASE_URL` está configurada.

## Estrutura inicial

- `app_state`: versão atual do documento operacional e sua revisão;
- `app_state_revisions`: cópia imutável de cada revisão confirmada, com data e ator;
- `app_users`: usuários, funções e hashes de senha;
- `schema_migrations`: migrações já aplicadas.
- A migração `002_user_roles.sql` amplia os papéis de acesso sem invalidar contas legadas `operador`.

Essa primeira etapa prioriza transações, histórico e recuperação sem exigir mudanças simultâneas em todas as telas. O modelo normalizado de `database/schema.sql` permanece como evolução posterior.

## Migrações

```bash
set -a
. /etc/proelium/database.env
set +a
cd /opt/proelium-operacional
npm run db:migrate
```

O deploy automático executa esse passo antes de reiniciar o serviço.
Cada arquivo e seu registro em `schema_migrations` são confirmados na mesma transação; uma falha deixa a migração pendente para uma nova tentativa segura.

## Backup

- execução diária aproximada: 03:15 UTC;
- diretório: `/var/backups/proelium`;
- formato: dump customizado do PostgreSQL acompanhado de SHA-256;
- retenção local padrão: 30 dias;
- teste semanal: restauração em banco temporário e conferência das tabelas principais.

Comandos de acompanhamento:

```bash
systemctl status proelium-backup.timer
systemctl status proelium-restore-check.timer
journalctl -u proelium-backup.service --no-pager
journalctl -u proelium-restore-check.service --no-pager
```

## Contingência temporária

O arquivo `/var/lib/proelium-operacional/shared-data.before-postgresql.json` preserva o estado imediatamente anterior à importação. O espelho atualizado continua em `shared-data.json`. A desativação do PostgreSQL não deve ser feita durante gravações; exige janela controlada, parada do serviço e validação da revisão mais recente.

## Segurança

- PostgreSQL aceita a aplicação apenas pelo endereço local do VPS;
- credenciais ficam em `/etc/proelium/database.env`, fora do Git;
- o serviço web não publica arquivos de código, configuração, banco ou documentação;
- os hashes de senha existentes foram importados sem converter ou expor senhas;
- `DATABASE_URL`, dumps e dados operacionais não entram no GitHub.
