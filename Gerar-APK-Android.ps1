$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$androidRoot = Join-Path $projectRoot "android"
$jdkStore = Join-Path $androidRoot ".tools\temurin17"
$gradleHome = Join-Path $androidRoot ".gradle-local"
$releaseDir = Join-Path $androidRoot "release"
$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$jdkZip = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE "Downloads") -Filter "*.zip" -File |
  Where-Object { $_.Name -match "OpenJDK17|Temurin|jdk.*17" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $jdkZip) {
  throw "Não encontrei o ZIP do Java 17 em Downloads. Baixe o Temurin 17 e tente novamente."
}

New-Item -ItemType Directory -Force -Path $jdkStore, $gradleHome, $releaseDir | Out-Null
if (-not (Test-Path (Join-Path $androidSdk "platform-tools"))) {
  throw "O Android SDK não foi encontrado em $androidSdk. Abra o Android Studio e instale o Android SDK antes de gerar o APK."
}

$sdkPropertyPath = Join-Path $androidRoot "local.properties"
$sdkPropertyValue = "sdk.dir=" + ($androidSdk -replace "\\", "\\\\")
Set-Content -LiteralPath $sdkPropertyPath -Value $sdkPropertyValue -Encoding ascii

$jdk = Get-ChildItem -LiteralPath $jdkStore -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) {
  Write-Host "Preparando o Java 17..." -ForegroundColor Cyan
  Expand-Archive -LiteralPath $jdkZip.FullName -DestinationPath $jdkStore -Force
  $jdk = Get-ChildItem -LiteralPath $jdkStore -Directory | Select-Object -First 1
}

if (-not (Test-Path (Join-Path $jdk.FullName "bin\java.exe"))) {
  throw "O Java extraído não contém bin\java.exe."
}

$env:JAVA_HOME = $jdk.FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:GRADLE_USER_HOME = $gradleHome

Write-Host "Gerando APK Android com a logo oficial..." -ForegroundColor Cyan
Push-Location $androidRoot
try {
  & .\gradlew.bat assembleDebug --no-daemon --no-configuration-cache
  if ($LASTEXITCODE -ne 0) { throw "A compilação do Android falhou." }
} finally {
  Pop-Location
}

$apkSource = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"
$apkTarget = Join-Path $releaseDir "Proelium-Operacional-1.5.apk"
if (-not (Test-Path $apkSource)) { throw "O APK não foi encontrado após a compilação." }
Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force

Write-Host "Pronto! APK gerado em:" -ForegroundColor Green
Write-Host $apkTarget
Start-Process explorer.exe -ArgumentList "/select,`"$apkTarget`""
