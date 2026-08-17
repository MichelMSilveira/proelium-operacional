# Encerramento operacional

## Estado atual

- Sistema publicado no VPS com HTTPS.
- Aplicativo web, APK Android e executável Windows conectados ao mesmo servidor.
- Usuários e permissões funcionando.
- Sessão de login mantida por cookie assinado por até 30 dias, inclusive após reinício do serviço.
- Dados compartilhados entre os dispositivos por PostgreSQL.
- Cache do aplicativo invalidado a cada atualização da interface.

## Onde os dados ficam

No VPS:

- PostgreSQL: fonte principal de clientes, produtos, orçamentos, projetos, operações, usuários e revisões.
- `/var/lib/proelium-operacional/shared-data.json`: espelho temporário de contingência.
- `/var/lib/proelium-operacional/users.json`: espelho temporário dos usuários e hashes.
- `/var/backups/proelium`: dumps diários e arquivos de integridade.

Os arquivos `data/` do projeto local são cópias de trabalho. Eles não devem ser enviados ao GitHub.

## Cálculo dos orçamentos

O total líquido é calculado por item:

`preço × quantidade × (1 − desconto / 100)`

O custo usa `custo × quantidade`. A margem é:

`(venda líquida − custo) / venda líquida`

Equipamentos rateados usam somente a fração atribuída ao ambiente. O sistema mantém quantidade, desconto, capacidade, ambiente físico e vínculos técnicos.

O valor salvo no orçamento é recalculado depois de cada alteração para evitar divergência entre detalhe, lista, BI e projeto.

## Caixas acústicas

As caixas são vendidas por unidade (`un`), não por par. Na migração:

- o preço do par foi dividido por dois;
- a quantidade em pares foi multiplicada por dois;
- os totais nominais foram preservados;
- foi criado backup em `shared-data.before-speaker-unit-migration.json`.

## Lista de obra e compras

Na tela **Lista de obra e compras**, o botão **Unificar repetidos** agrupa itens pelo projeto, produto e unidade. Ele soma quantidades, junta ambientes/observações e mantém o status mais pendente. A operação pode ser desfeita pela ação de desfazer.

## Atualizações

- Alterações web: execute `Atualizar-VPS.ps1`; não é necessário reinstalar o APK.
- Alterações nativas (ícone, permissões ou código Android): compile e distribua um novo APK.
- O APK possui verificador de versão no VPS e oferece o download quando encontra uma versão nova.
- O workflow automático do GitHub instala dependências, aplica migrações e confirma o PostgreSQL antes de concluir a implantação.

## Backups importantes

Antes de alterações de dados foram criados backups no VPS, incluindo:

- `shared-data.before-total-repair.json`;
- `shared-data.before-speaker-unit-migration.json`.

## Banco de dados

A migração inicial para PostgreSQL mantém o contrato atual da API, registra revisões e conserva o JSON como espelho durante a conferência. Backups diários e testes semanais de restauração complementam o histórico transacional.

## Encerramento da sessão

Para parar o uso, basta fechar os aplicativos. Para sair de uma conta específica, use **Sair** no sistema. O VPS e os dados permanecem ativos para os demais usuários.
