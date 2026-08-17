$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $appDirectory

Write-Host ''
Write-Host 'PROELIUM — PUBLICACAO NO GITHUB' -ForegroundColor Green
Write-Host ''

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git nao foi encontrado neste terminal.' }

$status = git status --short
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar o repositorio.' }

if ($status) {
  Write-Host 'Alteracoes encontradas:' -ForegroundColor Yellow
  $status | ForEach-Object { Write-Host "  $_" }
  Write-Host ''
  $confirmation = Read-Host 'Publicar todas essas alteracoes? Digite SIM'
  if ($confirmation -ne 'SIM') { Write-Host 'Publicacao cancelada. Nenhum arquivo foi enviado.'; exit 0 }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  $bundledNode = 'C:\Users\miche\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  $nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { $null }
  if (-not $nodeExecutable) { throw 'Node.js nao foi encontrado para validar o projeto.' }
  & $nodeExecutable --check app.js
  if ($LASTEXITCODE -ne 0) { throw 'app.js possui erro de sintaxe.' }
  & $nodeExecutable --check server.js
  if ($LASTEXITCODE -ne 0) { throw 'server.js possui erro de sintaxe.' }
  & $nodeExecutable --check storage.js
  if ($LASTEXITCODE -ne 0) { throw 'storage.js possui erro de sintaxe.' }
  & $nodeExecutable --test test/storage.test.js
  if ($LASTEXITCODE -ne 0) { throw 'Os testes de armazenamento falharam.' }

  $message = Read-Host 'Descricao curta da atualizacao'
  if ([string]::IsNullOrWhiteSpace($message)) { throw 'A descricao do commit e obrigatoria.' }
  git add -A
  git commit -m $message
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel criar o commit.' }
} else {
  Write-Host 'Nenhuma alteracao local pendente. Enviando commits existentes.'
}

$branch = git branch --show-current
if ([string]::IsNullOrWhiteSpace($branch)) { throw 'Nao foi possivel identificar a branch atual.' }
git push --set-upstream origin $branch
if ($LASTEXITCODE -ne 0) { throw 'O envio falhou. Confira a autenticacao com gh auth status.' }

Write-Host ''
Write-Host 'Publicacao concluida com sucesso.' -ForegroundColor Green
Write-Host "Branch enviada: $branch"
git log -1 --oneline
Read-Host 'Pressione Enter para fechar'
