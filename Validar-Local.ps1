$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $appDirectory

$branch = (git branch --show-current).Trim()
if ($branch -eq 'main') {
  throw 'Validação local deve rodar em uma branch de trabalho. Não execute este script na main.'
}

Write-Host "Validando branch local: $branch" -ForegroundColor Cyan
Write-Host '1/5 Verificação de sintaxe e testes do legado...' -ForegroundColor DarkCyan
npm run check
if ($LASTEXITCODE -ne 0) { throw 'A verificação principal falhou.' }

Write-Host '2/5 Smoke bot em servidor local isolado...' -ForegroundColor DarkCyan
npm run test:bot
if ($LASTEXITCODE -ne 0) { throw 'O smoke bot local falhou.' }

Write-Host '3/5 Bot de interface percorrendo o ciclo comercial completo...' -ForegroundColor DarkCyan
npm run test:ui-flow
if ($LASTEXITCODE -ne 0) { throw 'O bot de interface local falhou.' }

Write-Host '4/5 Tipos e build do frontend Next.js...' -ForegroundColor DarkCyan
npm run check:frontend
if ($LASTEXITCODE -ne 0) { throw 'A verificação do frontend Next.js falhou. Execute npm --prefix frontend ci se as dependências estiverem ausentes.' }

Write-Host '5/5 Build do backend NestJS...' -ForegroundColor DarkCyan
npm run check:nest
if ($LASTEXITCODE -ne 0) { throw 'A verificação do backend NestJS falhou. Execute npm --prefix backend-nest ci se as dependências estiverem ausentes.' }

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'O diff contém problemas de formatação.' }

Write-Host ''
Write-Host 'Validação local concluída. Build do Nest não substitui testes de contrato e integração; o VPS ainda não foi alterado.' -ForegroundColor Green
Write-Host 'Para testar manualmente, execute .\Iniciar-App.ps1 e abra http://localhost:4173.'
Write-Host 'Só depois de revisar e aprovar, faça merge desta branch na main para publicar.'
