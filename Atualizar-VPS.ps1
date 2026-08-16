$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$key = if ($env:PROELIUM_VPS_KEY) { $env:PROELIUM_VPS_KEY } else { Join-Path $HOME '.ssh\id_ed25519_proelium_vps' }
$hostName = if ($env:PROELIUM_VPS_HOST) { $env:PROELIUM_VPS_HOST } else { '144.202.29.121' }
$remote = "root@$hostName"

if (-not (Test-Path -LiteralPath $key)) { throw "Chave SSH não encontrada: $key" }
$files = @('server.js','app.js','index.html','styles.css','sw.js','manifest.webmanifest')
foreach ($file in $files) {
  scp -i $key -o StrictHostKeyChecking=no (Join-Path $appDirectory $file) "$remote`:/tmp/proelium-$file"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar $file" }
}
scp -r -i $key -o StrictHostKeyChecking=no (Join-Path $appDirectory 'assets') "$remote`:/tmp/proelium-assets"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar assets' }

$remoteCommand = "install -o root -g root -m 644 /tmp/proelium-server.js /opt/proelium-operacional/server.js; install -o root -g root -m 644 /tmp/proelium-app.js /opt/proelium-operacional/app.js; install -o root -g root -m 644 /tmp/proelium-index.html /opt/proelium-operacional/index.html; install -o root -g root -m 644 /tmp/proelium-styles.css /opt/proelium-operacional/styles.css; install -o root -g root -m 644 /tmp/proelium-sw.js /opt/proelium-operacional/sw.js; install -o root -g root -m 644 /tmp/proelium-manifest.webmanifest /opt/proelium-operacional/manifest.webmanifest; cp -R /tmp/proelium-assets/. /opt/proelium-operacional/assets/; rm -rf /tmp/proelium-assets /tmp/proelium-*.js /tmp/proelium-*.html /tmp/proelium-*.css /tmp/proelium-*.webmanifest; systemctl restart proelium; systemctl is-active proelium"
ssh -i $key -o StrictHostKeyChecking=no $remote $remoteCommand
if ($LASTEXITCODE -ne 0) { throw 'Falha ao reiniciar o serviço no VPS' }
Write-Host 'Atualização remota concluída. O APK e o executável carregarão a versão nova do VPS.' -ForegroundColor Green
