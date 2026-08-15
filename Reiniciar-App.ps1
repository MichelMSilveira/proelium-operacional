$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = 'C:\Users\miche\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCommand) {
  $nodeExecutable = $nodeCommand.Source
} elseif (Test-Path -LiteralPath $bundledNode) {
  $nodeExecutable = $bundledNode
} else {
  Write-Host 'Node.js nao foi encontrado.' -ForegroundColor Red
  Read-Host 'Pressione Enter para fechar'
  exit 1
}

$listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $serverProcess = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  if ($serverProcess.ProcessName -notmatch '^node') {
    Write-Host "A porta 4173 esta sendo usada por $($serverProcess.ProcessName). Nada foi encerrado." -ForegroundColor Red
    Read-Host 'Pressione Enter para fechar'
    exit 1
  }
  Write-Host 'Encerrando a versao antiga do servidor...'
  Stop-Process -Id $serverProcess.Id -Force
  Start-Sleep -Milliseconds 700
}

Set-Location -LiteralPath $appDirectory
Write-Host ''
Write-Host 'PROELIUM OPERACIONAL' -ForegroundColor Green
Write-Host 'Servidor compartilhado iniciado em http://localhost:4173'
Write-Host 'Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.'
Write-Host ''
& $nodeExecutable 'server.js'
