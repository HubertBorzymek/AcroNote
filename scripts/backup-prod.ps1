# Pobiera spójną kopię produkcyjnej bazy AcroNote z Fly.io na ten komputer.
#   scripts\pobierz-kopie.bat            -> Dokumenty\AcroNote-kopie\acronote-RRRR-MM-DD_GGMM.db (nowy plik)
#   backup-prod.ps1 -Weekly              -> Dokumenty\AcroNote-kopie\acronote-tygodniowa.db (nadpisywany)
# Wymaga zainstalowanego flyctl i jednorazowego "fly auth login". Kopia zawiera prawdziwe dane
# użytkowników: trzymaj ją tylko u siebie, nigdy w repozytorium ani w udostępnianym folderze.
param(
  [switch]$Weekly,
  [string]$App = 'acronote',
  [string]$Folder = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'AcroNote-kopie')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Folder | Out-Null
$log = Join-Path $Folder 'kopie.log'
function Write-Log([string]$text) { $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $text"; Write-Host $line; Add-Content -Path $log -Value $line -Encoding UTF8 }

try {
  $fly = (Get-Command flyctl -ErrorAction SilentlyContinue).Source
  if (-not $fly) { $fly = Join-Path $env:USERPROFILE '.fly\bin\flyctl.exe' }
  if (-not (Test-Path $fly)) { throw 'Nie znaleziono flyctl. Zainstaluj go: https://fly.io/docs/flyctl/install/' }

  # The machine stops when idle; a request to the site wakes it before "fly ssh".
  try { Invoke-WebRequest "https://$App.fly.dev/api/health" -UseBasicParsing -TimeoutSec 60 | Out-Null } catch { Write-Log "Uwaga: strona nie odpowiedziała ($($_.Exception.Message)). Próbuję dalej." }

  $remote = '/tmp/acronote-kopia.db'
  & $fly ssh console -a $App -C "node apps/api/dist/backup-cli.js $remote"
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się utworzyć kopii na serwerze (fly ssh console).' }

  $name = if ($Weekly) { 'acronote-tygodniowa.db' } else { "acronote-$(Get-Date -Format 'yyyy-MM-dd_HHmm').db" }
  $partial = Join-Path $Folder 'pobieranie.tmp'
  if (Test-Path $partial) { Remove-Item $partial -Force }
  & $fly ssh sftp get -a $App $remote $partial
  $downloaded = $LASTEXITCODE -eq 0 -and (Test-Path $partial) -and (Get-Item $partial).Length -gt 0
  & $fly ssh console -a $App -C "rm -f $remote" | Out-Null
  if (-not $downloaded) { throw 'Nie udało się pobrać kopii (fly ssh sftp get).' }

  # The previous weekly copy is replaced only after the new one arrived in full.
  $target = Join-Path $Folder $name
  Move-Item -Path $partial -Destination $target -Force
  Write-Log "Zapisano kopię: $target ($([math]::Round((Get-Item $target).Length / 1KB)) KB)"
}
catch {
  Write-Log "BŁĄD: $($_.Exception.Message)"
  exit 1
}
