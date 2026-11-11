# Zakłada w Harmonogramie zadań Windows cotygodniową kopię produkcyjnej bazy (niedziela 19:00).
# Gdy komputer był wtedy wyłączony, zadanie wykona się przy najbliższym włączeniu.
# Plik Dokumenty\AcroNote-kopie\acronote-tygodniowa.db jest nadpisywany co tydzień.
#   scripts\zaplanuj-kopie.bat            zakłada albo aktualizuje zadanie
#   schedule-weekly-backup.ps1 -Remove    usuwa zadanie
param([switch]$Remove, [string]$Day = 'Sunday', [string]$At = '19:00')
$ErrorActionPreference = 'Stop'
$name = 'AcroNote - cotygodniowa kopia bazy'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Host "Usunięto zadanie „$name”."; exit 0 }

$script = Join-Path $PSScriptRoot 'backup-prod.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Weekly"
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
# Runs as the signed-in user, because flyctl keeps its login in this user's profile.
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Pobiera kopię bazy AcroNote z Fly.io do Dokumenty\AcroNote-kopie (scripts\backup-prod.ps1 -Weekly).' -Force | Out-Null
Write-Host "Zadanie „$name” ustawione: co tydzień ($Day, $At). Wynik i błędy: Dokumenty\AcroNote-kopie\kopie.log"
