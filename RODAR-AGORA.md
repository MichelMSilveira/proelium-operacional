# Rodar a base agora

## 1. No PC servidor

1. Execute `Iniciar-App.ps1` com PowerShell.
2. Mantenha a janela aberta.
3. Confirme que `http://localhost:4173` abre no navegador.

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

Atualize os arquivos da pasta e reinicie o servidor quando `server.js` for alterado. Nos demais casos, reabra ou atualize o app.

## Limitações

- não há login dentro do app;
- o PC precisa permanecer ligado e sem suspensão;
- o arquivo compartilhado não controla alterações simultâneas;
- use apenas dados de teste;
- faça backup antes de mudanças importantes.

