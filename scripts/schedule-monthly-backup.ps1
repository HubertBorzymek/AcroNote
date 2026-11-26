# Zakłada w Harmonogramie zadań Windows comiesięczną kopię produkcyjnej bazy (1. dnia miesiąca, 19:00).
# Gdy komputer był wtedy wyłączony, zadanie wykona się przy najbliższym włączeniu.
# Plik Dokumenty\AcroNote-kopie\acronote-miesieczna.db jest nadpisywany co miesiąc (bez historii).
#   scripts\zaplanuj-kopie.bat             zakłada albo aktualizuje zadanie (i usuwa dawne cotygodniowe)
#   schedule-monthly-backup.ps1 -Remove    usuwa zadanie
param([switch]$Remove, [int]$Day = 1, [string]$At = '19:00')
$ErrorActionPreference = 'Stop'
$name = 'AcroNote - comiesieczna kopia bazy'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Host "Usunięto zadanie „$name”."; exit 0 }

# The former weekly task (and its file name) is replaced by this one.
$weekly = 'AcroNote - cotygodniowa kopia bazy'
if (Get-ScheduledTask -TaskName $weekly -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $weekly -Confirm:$false; Write-Host "Usunięto dawne zadanie „$weekly”." }

$script = Join-Path $PSScriptRoot 'backup-prod.ps1'
# New-ScheduledTaskTrigger has no monthly trigger, so schtasks creates the task and the cmdlets set the rest.
schtasks.exe /Create /TN $name /SC MONTHLY /D $Day /ST $At /TR 'powershell.exe' /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Nie udało się utworzyć zadania (schtasks).' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Monthly"
# A laptop is often on battery; Windows' default (no start on battery) skipped every run of the weekly task.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
# Runs as the signed-in user, because flyctl keeps its login in this user's profile.
Set-ScheduledTask -TaskName $name -Action $action -Settings $settings | Out-Null
Write-Host "Zadanie „$name” ustawione: co miesiąc ($Day. dnia, $At) albo przy najbliższym włączeniu komputera. Wynik i błędy: Dokumenty\AcroNote-kopie\kopie.log"
