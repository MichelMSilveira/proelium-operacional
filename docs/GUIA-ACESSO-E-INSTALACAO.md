# Guia de acesso e instalação

## Acesso ao sistema

- URL pública: <https://144.202.29.121>
- O sistema roda no VPS e os dados são compartilhados entre os dispositivos.
- Use o usuário e a senha cadastrados na área **Usuários**. A senha não fica registrada neste documento.

Se o navegador continuar pedindo login, abra uma janela anônima ou faça uma atualização forçada. A autenticação antiga por Basic Auth foi removida; o sistema usa apenas a tela de login do aplicativo.

## Cadastro e controle de usuários

1. Entre como administrador.
2. Abra **Usuários** no menu do sistema.
3. Cadastre o nome de usuário, senha e perfil (**Administrador** ou **Operador**).
4. Use o botão de ativar/desativar para bloquear um usuário sem apagar seus registros.

Somente administradores podem gerenciar usuários. Para redefinir o administrador diretamente no servidor, use o comando `node auth-admin.js` dentro da pasta do projeto.

## Windows

Há duas versões no diretório principal do projeto:

Os pacotes atuais são a versão `0.1.3` e usam o símbolo oficial colorido da Proelium.

- `Proelium-Operacional-Setup.exe`: instalador tradicional.
- `Proelium-Operacional-Portable.exe`: roda sem instalação.

O aplicativo Windows abre uma janela própria e se conecta ao VPS. Ele não mantém uma base local separada.

## Android

O sistema é um PWA (Progressive Web App) e pode ser instalado como aplicativo:

1. Abra `https://144.202.29.121` no Chrome do Android.
2. Faça login.
3. Abra o menu ⋮ e toque em **Instalar aplicativo** ou **Adicionar à tela inicial**.

O ícone aparecerá junto dos demais aplicativos e continuará sincronizado com o VPS.

## iPhone/iPad

1. Abra `https://144.202.29.121` no Safari.
2. Toque em **Compartilhar**.
3. Escolha **Adicionar à Tela de Início**.

## Segurança e operação do VPS

- HTTPS está ativo; a porta pública do aplicativo é 443.
- A aplicação roda internamente na porta 4173, protegida pelo Nginx.
- O firewall libera apenas SSH, HTTP e HTTPS.
- Os dados de produção ficam em `data/` e não devem ser enviados ao Git.
- Como a senha root foi compartilhada durante a configuração, ela deve ser trocada no provedor VPS.

## APK e IPA nativos

O PWA já funciona no Android e iOS sem loja. Para gerar um APK assinado ou um IPA para a App Store, será necessário configurar Android SDK/Android Studio e, para iOS, macOS com Xcode e uma conta Apple Developer.

O próximo APK de validação será a versão `1.4` (`versionCode 5`) e usa o símbolo oficial colorido da Proelium no launcher.

## Atualização remota

O APK Android e o executável Windows carregam a interface do VPS. Para publicar alterações web sem reinstalar os aplicativos, execute no PowerShell:

```powershell
.\Atualizar-VPS.ps1
```

O script envia os arquivos da interface, atualiza os assets e reinicia o serviço. Os dados em `data/` e as credenciais não são enviados nem alterados.

### Deploy automático pelo GitHub

O arquivo `.github/workflows/deploy-vps.yml` publica automaticamente cada push na branch `main`. No repositório GitHub, abra **Settings → Secrets and variables → Actions** e crie:

- `VPS_HOST`: endereço do VPS;
- `VPS_USER`: usuário SSH, normalmente `root`;
- `VPS_SSH_KEY`: conteúdo completo da chave privada usada para acessar o VPS;
- `VPS_KNOWN_HOSTS` (opcional): saída de `ssh-keyscan -H IP_DO_VPS`.

Depois de cadastrar os secrets, qualquer `git push origin main` inicia o deploy. O workflow exclui `data/`, não substitui usuários ou senhas e valida que o serviço terminou ativo.
