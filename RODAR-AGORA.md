# Rodar a base agora

## 1. No PC servidor

1. Execute `Iniciar-App.ps1` com PowerShell.
2. Mantenha a janela aberta.
3. Para garantir que a versão atual esteja ativa, execute `Reiniciar-App.ps1` e mantenha a janela aberta.
4. Confirme que `http://localhost:4173` abre no navegador.

O Live Server do VS Code não deve ser usado nesta fase, pois ele não oferece a API que compartilha os cadastros.

## 2. Publicar no Tailscale

Abra o PowerShell como administrador e execute:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" serve --bg 4173
& "C:\Program Files\Tailscale\tailscale.exe" serve status
```

O resultado esperado aponta o endereço HTTPS para `http://127.0.0.1:4173`.

## 3. Conectar outro dispositivo

1. Instale o Tailscale no dispositivo.
2. Convide o usuário pelo painel administrativo da sua rede Tailscale.
3. O usuário aceita o convite com a própria conta.
4. Ative a VPN do Tailscale.
5. Confirme que `homehell` aparece na lista de máquinas.
6. Abra o endereço HTTPS terminado em `.ts.net` no navegador.

Nunca use `localhost`, `127.0.0.1` ou `file:///` em outro dispositivo.

## 4. Instalar como app

- iPhone/iPad: Safari → Compartilhar → Adicionar à Tela de Início.
- Android: Chrome → menu → Instalar app.
- Windows: Edge/Chrome → ícone de instalação na barra de endereço.

## 5. Atualizações

As atualizações enviadas para `main` são implantadas automaticamente no VPS. O fluxo instala as dependências, aplica as migrações PostgreSQL, reinicia o serviço e confere `/api/health`.

## Limitações

- o acesso exige login e conexão ao endereço oficial do VPS;
- o contrato atual ainda envia o documento operacional de forma agregada;
- alterações concorrentes usam revisões e podem pedir que a última ação seja repetida;
- o PostgreSQL é a fonte principal e o JSON é somente um espelho temporário;
- os dumps diários e os testes semanais de restauração devem permanecer ativos.
