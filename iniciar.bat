@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instale Node.js 24 ou superior.
  pause
  exit /b 1
)
if not exist node_modules call npm ci --ignore-scripts
if errorlevel 1 exit /b 1
call npm start
pause
endlocal
