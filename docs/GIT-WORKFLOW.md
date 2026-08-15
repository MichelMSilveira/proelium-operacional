# Fluxo de desenvolvimento e Git

## Publicação automatizada

No PC principal, execute `Publicar-GitHub.ps1`. O script:

1. lista todas as alterações não ignoradas;
2. exige a confirmação literal `SIM`;
3. valida `app.js` e `server.js`;
4. solicita uma descrição curta;
5. cria o commit;
6. envia a branch atual para `origin`.

Se não houver arquivos pendentes, o script envia os commits locais já existentes. Dados operacionais continuam protegidos pelo `.gitignore`.

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
7. Enviar ao GitHub quando o repositório remoto estiver configurado.

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
