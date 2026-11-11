@echo off
rem Ustawia cotygodniowa kopie produkcyjnej bazy AcroNote (Harmonogram zadan Windows).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule-weekly-backup.ps1"
pause
