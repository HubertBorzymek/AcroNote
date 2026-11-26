@echo off
rem Ustawia comiesieczna kopie produkcyjnej bazy AcroNote (Harmonogram zadan Windows).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule-monthly-backup.ps1"
pause
