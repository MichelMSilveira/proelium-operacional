# Operação do ambiente de testes

## Componentes

| Componente | Responsabilidade |
|---|---|
| VS Code | editar os arquivos do projeto |
| Git | registrar versões do código e da documentação |
| GitHub | repositório remoto futuro |
| `server.js` | servir o app e armazenar dados compartilhados |
| Tailscale Serve | fornecer acesso HTTPS privado |
| PostgreSQL | manter os dados operacionais, usuários e histórico de revisões |
| Espelho JSON | contingência temporária durante a conferência da migração |

## Inicialização diária

1. Ligar o PC servidor e conectar o Tailscale.
2. Executar `Reiniciar-App.ps1` e manter a janela aberta.
3. Verificar `http://localhost:4173`.
4. Executar `tailscale serve status` e confirmar proxy para a porta 4173.
5. Testar o endereço HTTPS em um segundo dispositivo.

## Encerramento

Fechar a janela do servidor interrompe o acesso. Antes de desligar o PC, aguarde o término de qualquer cadastro e faça backup quando houver alterações relevantes.

## Backup

O PostgreSQL gera backup diário em `/var/backups/proelium` e executa uma restauração de teste semanal. O espelho JSON continua fora do Git, mas não substitui o dump do banco. Consulte [DATABASE.md](DATABASE.md).

## Recuperação

A recuperação normal usa um dump PostgreSQL validado. A volta temporária ao espelho JSON exige janela controlada e conferência da revisão; nunca altere o arquivo manualmente enquanto o servidor estiver rodando.

## Diagnóstico rápido

- `localhost:4173` não abre: servidor local não está rodando.
- Android abre e iPhone não: conta, VPN ou rede Tailscale do iPhone.
- endereço `.ts.net` aponta para 5500: Tailscale ainda está ligado ao Live Server.
- exclusão não aparece em outro dispositivo: abra `https://homehell.tail99a9b2.ts.net/api/data`. A resposta deve ser JSON; `Cannot GET /api/data` indica que o Tailscale aponta para o servidor errado.
- inclusões, edições e exclusões são enviadas automaticamente aos demais aparelhos. Se a conexão cair, o aplicativo tenta reconectar e também confere o servidor a cada 5 segundos.
- se duas pessoas alterarem a partir da mesma versão, a segunda gravação é bloqueada; a tela recebe os dados atuais e pede que a última ação seja repetida.
- `/api/events` retorna `404`: existe uma instância antiga do servidor na porta 4173; execute `Reiniciar-App.ps1`.

## Bot de teste operacional

Com o app em execução, rode `npm run test:bot`. O bot faz verificações somente de leitura em `http://127.0.0.1:4173`: saúde e horário do servidor, backend de armazenamento, interface principal, manifesto PWA, service worker e proteção da API.

Para testar outro endereço, acrescente a URL: `npm run test:bot -- https://endereco-do-app`. Para também validar login, sessão e leitura sincronizada, defina `PROELIUM_TEST_USER` e `PROELIUM_TEST_PASSWORD` antes de executar. As credenciais não devem ser gravadas em arquivos nem incluídas no Git.

O deploy da `main` envia o bot ao VPS e o executa depois da reinicialização do serviço. Qualquer verificação reprovada encerra o workflow com erro e impede que uma implantação defeituosa seja declarada concluída.
