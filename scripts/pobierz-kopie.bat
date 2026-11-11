@echo off
rem Pobiera kopie produkcyjnej bazy AcroNote do Dokumenty\AcroNote-kopie (nowy plik z data).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-prod.ps1"
pause
