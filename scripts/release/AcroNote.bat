@echo off
setlocal
cd /d "%~dp0"
title AcroNote
set "URL=http://localhost:3001"
set "NODE=%~dp0node\node.exe"

if not exist "%NODE%" (
  echo Nie znaleziono node\node.exe.
  echo Najpierw rozpakuj cale archiwum ZIP do folderu, a potem uruchom AcroNote.bat z tego folderu.
  pause
  exit /b 1
)

rem Dane trzymamy poza folderem programu, zeby aktualizacja (nowy ZIP) ich nie usunela.
rem Inna lokalizacje mozna ustawic w pliku .env (DATABASE_PATH=...).
if not defined DATABASE_PATH (
  findstr /b /c:"DATABASE_PATH=" .env >nul 2>nul || set "DATABASE_PATH=%LOCALAPPDATA%\AcroNote\acronote.db"
)
if not defined LOG_LEVEL set "LOG_LEVEL=warn"

rem Juz dziala? Wtedy tylko otworz przegladarke.
"%NODE%" -e "fetch('%URL%/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
if not errorlevel 1 (
  echo AcroNote juz dziala pod adresem %URL%
  start "" %URL%
  exit /b 0
)

echo Uruchamianie AcroNote...  ^(zamknij to okno, aby zatrzymac^)
if defined DATABASE_PATH echo Dane: %DATABASE_PATH%
start "" /b "%NODE%" -e "const go=n=>fetch('%URL%/api/health').then(()=>require('child_process').exec('start %URL%'),()=>n>0&&setTimeout(()=>go(n-1),500));go(40)"
"%NODE%" --env-file-if-exists=.env apps\api\dist\server.js
pause
endlocal
