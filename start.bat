@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Brak zaleznosci. Uruchom najpierw: npm install
  pause
  exit /b 1
)
if not exist packages\web\dist\index.html (
  echo Brak buildu. Budowanie aplikacji...
  call npm run build
  if errorlevel 1 (
    echo Budowanie nie powiodlo sie.
    pause
    exit /b 1
  )
)
echo Uruchamianie AcroNote pod adresem http://localhost:3001
start "" http://localhost:3001
npm run start
endlocal
