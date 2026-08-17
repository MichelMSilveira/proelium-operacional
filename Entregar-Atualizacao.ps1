param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Message
)

$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $appDirectory

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git não foi encontrado neste terminal.' }

$status = git status --short
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar o repositório.' }
if (-not $status) { throw 'Não há alterações para entregar.' }
if (-not ($status | Select-String -SimpleMatch 'CHANGELOG.md')) {
  throw 'Atualize CHANGELOG.md antes de concluir a entrega.'
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = 'C:\Users\miche\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { $null }
if (-not $nodeExecutable) { throw 'Node.js não foi encontrado para validar o projeto.' }

& $nodeExecutable --check app.js
if ($LASTEXITCODE -ne 0) { throw 'app.js possui erro de sintaxe.' }
& $nodeExecutable --check server.js
if ($LASTEXITCODE -ne 0) { throw 'server.js possui erro de sintaxe.' }

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'A revisão encontrou espaços ou conflitos inválidos.' }

git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o commit.' }

$branch = git branch --show-current
if ([string]::IsNullOrWhiteSpace($branch)) { throw 'Não foi possível identificar a branch atual.' }
git push --set-upstream origin $branch
if ($LASTEXITCODE -ne 0) { throw 'O commit foi criado, mas o envio ao GitHub falhou. Renove a autenticação e repita o push.' }

Write-Host ''
Write-Host 'Entrega enviada ao GitHub.' -ForegroundColor Green
if ($branch -eq 'main') {
  Write-Host 'A implantação automática no VPS foi iniciada pelo GitHub Actions.' -ForegroundColor Green
}
git log -1 --oneline
