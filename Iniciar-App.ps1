$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = 'C:\Users\miche\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCommand) {
  $nodeExecutable = $nodeCommand.Source
} elseif (Test-Path -LiteralPath $bundledNode) {
  $nodeExecutable = $bundledNode
} else {
  Write-Host 'Node.js não foi encontrado. Instale o Node.js ou abra este projeto pelo Codex.'
  Read-Host 'Pressione Enter para fechar'
  exit 1
}

Set-Location -LiteralPath $appDirectory
Write-Host ''
Write-Host 'PROELIUM OPERACIONAL'
Write-Host 'Servidor iniciado em http://localhost:4173'
Write-Host 'Dados compartilhados ficam neste computador.'
Write-Host 'Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.'
Write-Host ''
& $nodeExecutable 'server.js'
