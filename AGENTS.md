# Entrega contínua do Proelium

Este projeto deve terminar cada alteração funcional com uma entrega completa, salvo quando o usuário pedir explicitamente para manter o trabalho local.

## Fluxo obrigatório

1. Implementar a alteração na menor superfície necessária.
2. Identificar as plataformas afetadas:
   - mudanças em `app.js`, CSS, HTML, imagens ou service worker pertencem ao app web compartilhado e chegam ao PWA, Android e Windows após o deploy do VPS;
   - mudanças em `desktop/` exigem nova versão e novo pacote Windows;
   - mudanças em `android/` exigem incremento de `versionCode`/`versionName` e novo APK.
3. Para alterações no shell web, incrementar o identificador `CACHE` de `sw.js`.
4. Registrar a entrega em `CHANGELOG.md` e atualizar a documentação operacional afetada.
5. Validar `app.js` e `server.js`, conferir `git diff --check` e revisar os arquivos que entrarão no commit.
6. Nunca incluir `data/`, senhas, chaves, tokens, backups ou artefatos privados no Git.
7. Criar um commit objetivo no padrão do projeto e enviar a branch ao GitHub.
8. Em `main`, acompanhar a implantação automática no VPS e confirmar que o serviço e a página respondem. Se a automação do GitHub não estiver disponível, usar `Atualizar-VPS.ps1` e registrar essa contingência.
9. Informar ao usuário o commit, as plataformas atualizadas e o resultado da implantação.

## Regra de plataforma

O PWA, o APK Android e o cliente Windows usam a interface publicada no VPS. Uma mudança puramente web não exige gerar novamente APK ou EXE. Recompilar instaladores sem alteração nativa cria versões desnecessárias e deve ser evitado.
