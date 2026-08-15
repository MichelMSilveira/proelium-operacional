# Operação do ambiente de testes

## Componentes

| Componente | Responsabilidade |
|---|---|
| VS Code | editar os arquivos do projeto |
| Git | registrar versões do código e da documentação |
| GitHub | repositório remoto futuro |
| `server.js` | servir o app e armazenar dados compartilhados |
| Tailscale Serve | fornecer acesso HTTPS privado |
| `data/shared-data.json` | manter os dados experimentais |

## Inicialização diária

1. Ligar o PC servidor e conectar o Tailscale.
2. Executar `Reiniciar-App.ps1` e manter a janela aberta.
3. Verificar `http://localhost:4173`.
4. Executar `tailscale serve status` e confirmar proxy para a porta 4173.
5. Testar o endereço HTTPS em um segundo dispositivo.

## Encerramento

Fechar a janela do servidor interrompe o acesso. Antes de desligar o PC, aguarde o término de qualquer cadastro e faça backup quando houver alterações relevantes.

## Backup

Copie `data/shared-data.json` para uma pasta de backup com data no nome. O arquivo é ignorado pelo Git porque contém dados operacionais e pode incluir informações privadas.

## Recuperação

Com o servidor parado, substitua `data/shared-data.json` por uma cópia válida. Reinicie o servidor e atualize o app. Nunca edite o JSON manualmente enquanto o servidor estiver rodando.

## Diagnóstico rápido

- `localhost:4173` não abre: servidor local não está rodando.
- Android abre e iPhone não: conta, VPN ou rede Tailscale do iPhone.
- endereço `.ts.net` aponta para 5500: Tailscale ainda está ligado ao Live Server.
- exclusão não aparece em outro dispositivo: abra `https://homehell.tail99a9b2.ts.net/api/data`. A resposta deve ser JSON; `Cannot GET /api/data` indica que o Tailscale aponta para o servidor errado.
- inclusões, edições e exclusões são enviadas automaticamente aos demais aparelhos. Se a conexão cair, o aplicativo tenta reconectar e também confere o servidor a cada 5 segundos.
- se duas pessoas alterarem a partir da mesma versão, a segunda gravação é bloqueada; a tela recebe os dados atuais e pede que a última ação seja repetida.
- `/api/events` retorna `404`: existe uma instância antiga do servidor na porta 4173; execute `Reiniciar-App.ps1`.
