@echo off
setlocal
cd /d "%~dp0"
title AcroNote
set "URL=http://localhost:3001"

where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js. Zainstaluj Node.js 22 lub nowszy: https://nodejs.org
  pause
  exit /b 1
)

rem Juz dziala? Wtedy tylko otworz przegladarke.
node -e "fetch('%URL%/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
if not errorlevel 1 (
  echo AcroNote juz dziala pod adresem %URL%
  start "" %URL%
  exit /b 0
)

rem Instalacja zaleznosci przy pierwszym uruchomieniu lub po zmianie package-lock.json.
node -e "const fs=require('fs');try{process.exit(fs.statSync('package-lock.json').mtimeMs>fs.statSync('node_modules/.package-lock.json').mtimeMs?1:0)}catch{process.exit(1)}"
if errorlevel 1 (
  echo Instalowanie zaleznosci...
  call npm ci
  if errorlevel 1 (
    echo Instalacja zaleznosci nie powiodla sie.
    pause
    exit /b 1
  )
)

echo Budowanie aplikacji...
call npm run build
if errorlevel 1 (
  if not exist packages\web\dist\index.html (
    echo Budowanie nie powiodlo sie.
    pause
    exit /b 1
  )
  echo Budowanie nie powiodlo sie - uruchamiam poprzednia wersje.
)

echo Uruchamianie AcroNote pod adresem %URL%  ^(zamknij to okno, aby zatrzymac^)
start "" /b node -e "const go=n=>fetch('%URL%/api/health').then(()=>require('child_process').exec('start %URL%'),()=>n>0&&setTimeout(()=>go(n-1),500));go(40)"
call npm run start
pause
endlocal
