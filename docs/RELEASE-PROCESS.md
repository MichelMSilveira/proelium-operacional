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

1. Concluir uma mudança pequena e coerente.
2. Atualizar `CHANGELOG.md` e os guias relacionados.
3. Incrementar o cache de `sw.js` quando houver mudança no shell web.
4. Validar JavaScript e revisar o diff.
5. Criar commit e enviar `main` ao GitHub.
6. O GitHub Actions publica somente os arquivos de execução no VPS, preservando `data/`, usuários e credenciais.
7. Confirmar serviço ativo e resposta HTTP local no VPS.

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
