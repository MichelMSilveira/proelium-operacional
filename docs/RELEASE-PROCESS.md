# Processo contínuo de entrega

## Objetivo

Cada melhoria concluída deve formar uma entrega rastreável: código, documentação, Git, GitHub e VPS permanecem alinhados.

## Como as plataformas recebem atualizações

| Tipo de alteração | PWA / navegador | Android | Windows |
|---|---|---|---|
| Interface web, regras e estilos | Atualização do VPS e do cache | Recebe a interface do VPS | Recebe a interface do VPS |
| Invólucro Android | Sem impacto direto | Novo APK e incremento de versão | Sem impacto |
| Invólucro desktop | Sem impacto direto | Sem impacto | Novo instalador/portátil e incremento de versão |

O APK e o aplicativo Windows são clientes da mesma aplicação central. Eles não mantêm uma cópia independente dos dados e não precisam ser recompilados a cada ajuste visual.

## Sequência de uma entrega

1. Atualizar a cópia local e criar uma branch de trabalho; não desenvolver diretamente na `main`.
2. Concluir uma mudança pequena e coerente.
3. Atualizar `CHANGELOG.md` e os guias relacionados.
4. Incrementar o cache de `sw.js` quando houver mudança no shell web.
5. Executar `./Validar-Local.ps1`, revisar o app em `http://localhost:4173` e conferir o diff.
6. Enviar a branch de trabalho ao GitHub para manter o histórico, sem acionar produção.
7. Depois da aprovação, integrar a branch na `main`; somente esse push publica no VPS.
8. O GitHub Actions publica somente os arquivos de execução no VPS, preservando `data/`, usuários e credenciais.
9. Confirmar serviço ativo e resposta HTTP no VPS antes de considerar a entrega concluída.

## Desenvolvimento local primeiro

O servidor local é a referência durante a construção e não altera o VPS:

```powershell
git switch -c codex/minha-tarefa
.\Iniciar-App.ps1
```

Em outra janela, valide a branch sem tocar na produção:

```powershell
.\Validar-Local.ps1
```

Os bots iniciam servidores isolados e usam dados temporários. Para testar manualmente com os dados locais do projeto, use `http://localhost:4173`; não use o endereço público enquanto a mudança ainda estiver em avaliação. O VPS só deve ser conferido depois do merge em `main`.

## Automação

O comando abaixo executa validação, commit e envio ao GitHub:

```powershell
.\Entregar-Atualizacao.ps1 -Message "feat: descrição objetiva"
```

O push para `main` aciona `.github/workflows/deploy-vps.yml`. Os secrets necessários estão descritos no guia de acesso e instalação.

Se o GitHub Actions estiver temporariamente indisponível, a implantação pode ser feita pelo PC autorizado:

```powershell
.\Atualizar-VPS.ps1
```

## Proteção dos dados

Arquivos de `data/`, chaves SSH, senhas, tokens, backups, APKs e executáveis não entram no commit nem são substituídos pela implantação da interface.
