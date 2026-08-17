$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$key = if ($env:PROELIUM_VPS_KEY) { $env:PROELIUM_VPS_KEY } else { Join-Path $HOME '.ssh\id_ed25519_proelium_vps' }
$hostName = if ($env:PROELIUM_VPS_HOST) { $env:PROELIUM_VPS_HOST } else { '144.202.29.121' }
$remote = "root@$hostName"

if (-not (Test-Path -LiteralPath $key)) { throw "Chave SSH não encontrada: $key" }
$files = @('server.js','storage.js','package.json','package-lock.json','app.js','index.html','styles.css','quotes.css','bi.css','crm.css','danger.css','sw.js','manifest.webmanifest','icon.svg')
foreach ($file in $files) {
  scp -i $key -o StrictHostKeyChecking=no (Join-Path $appDirectory $file) "$remote`:/tmp/proelium-$file"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar $file" }
}
scp -r -i $key -o StrictHostKeyChecking=no (Join-Path $appDirectory 'assets') "$remote`:/tmp/proelium-assets"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar assets' }
scp -r -i $key -o StrictHostKeyChecking=no (Join-Path $appDirectory 'database') "$remote`:/tmp/proelium-database"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar arquivos do banco' }

$installCommands = $files | ForEach-Object { "install -o root -g root -m 644 /tmp/proelium-$_ /opt/proelium-operacional/$_" }
$cleanupCommands = $files | ForEach-Object { "rm -f /tmp/proelium-$_" }
$remoteCommand = ($installCommands -join '; ') + "; mkdir -p /opt/proelium-operacional/assets /opt/proelium-operacional/database; cp -R /tmp/proelium-assets/. /opt/proelium-operacional/assets/; cp -R /tmp/proelium-database/. /opt/proelium-operacional/database/; cd /opt/proelium-operacional; npm ci --omit=dev --no-audit --no-fund; set -a; . /etc/proelium/database.env; set +a; npm run db:migrate; rm -rf /tmp/proelium-assets /tmp/proelium-database; " + ($cleanupCommands -join '; ') + "; systemctl restart proelium; systemctl is-active proelium; curl --fail --silent --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:4173/api/health"
ssh -i $key -o StrictHostKeyChecking=no $remote $remoteCommand
if ($LASTEXITCODE -ne 0) { throw 'Falha ao reiniciar o serviço no VPS' }
Write-Host 'Atualização remota concluída. O APK e o executável carregarão a versão nova do VPS.' -ForegroundColor Green
