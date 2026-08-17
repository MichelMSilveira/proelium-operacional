# Fluxo de desenvolvimento e Git

## Entrega automatizada

No PC principal, execute:

```powershell
.\Entregar-Atualizacao.ps1 -Message "feat: descrição objetiva"
```

O script:

1. lista todas as alterações não ignoradas;
2. exige que `CHANGELOG.md` tenha sido atualizado;
3. valida `app.js` e `server.js`;
4. confere o diff;
5. cria o commit com a mensagem informada;
6. envia a branch atual para `origin`;
7. em `main`, inicia a implantação automática pelo GitHub Actions.

Dados operacionais continuam protegidos pelo `.gitignore`. O antigo `Publicar-GitHub.ps1` permanece disponível como contingência interativa.

## Conceitos

- A pasta contém a versão de trabalho.
- O VS Code edita a pasta.
- O Git registra alterações da pasta em commits.
- O GitHub armazenará uma cópia remota dos commits.
- Dados de clientes não devem ser enviados ao GitHub.

## Rotina recomendada

1. Atualizar a cópia local antes de começar.
2. Criar uma tarefa pequena e claramente definida.
3. Alterar somente os arquivos necessários.
4. Testar no PC e em um dispositivo móvel.
5. Revisar `git diff`.
6. Criar um commit com mensagem objetiva.
7. Enviar ao GitHub e acompanhar a implantação do VPS.
8. Confirmar que PWA, Android e Windows carregam a versão publicada. APK e EXE só são recompilados quando o código nativo correspondente muda.

## Padrão de commits

- `feat:` nova função;
- `fix:` correção de comportamento;
- `docs:` documentação;
- `chore:` configuração e manutenção;
- `refactor:` reorganização sem alterar comportamento.

Exemplos:

```text
feat: adicionar orçamento por ambiente
fix: compartilhar exclusões entre dispositivos
docs: registrar operação com Tailscale
```

## Arquivos que não entram no Git

- `data/shared-data.json`;
- cópias de backup;
- senhas, tokens e chaves;
- arquivos temporários.

## Divisão futura de trabalho

Cada pessoa deve trabalhar em uma tarefa separada. Alterações devem ser pequenas, testadas e documentadas antes de serem reunidas. A definição de responsáveis e pacotes de serviço será feita na próxima fase.
