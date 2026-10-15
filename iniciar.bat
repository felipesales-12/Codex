@echo off
chcp 65001 >nul
setlocal
title Compasso - Gerenciador de atividades
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1
  if not errorlevel 1 (
    py -3 server.py
    goto fim
  )
)
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1
  if not errorlevel 1 (
    python server.py
    goto fim
  )
)
echo Instale o Python 3.9 ou superior pelo site https://www.python.org/downloads/windows/
echo Na instalacao, marque "Add Python to PATH". Depois, abra este arquivo novamente.
:fim
pause
endlocal
