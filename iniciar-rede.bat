@echo off
chcp 65001 >nul
setlocal
title Compasso - Acesso na rede local
cd /d "%~dp0"
echo Compasso - acesso pelo navegador na rede local
echo Mantenha esta janela aberta para outros aparelhos acessarem o sistema.
echo.
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1
  if not errorlevel 1 (
    py -3 server.py --network
    goto fim
  )
)
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1
  if not errorlevel 1 (
    python server.py --network
    goto fim
  )
)
echo Instale o Python 3.9 ou superior pelo site https://www.python.org/downloads/windows/
echo Na instalacao, marque "Add Python to PATH". Depois, abra este arquivo novamente.
:fim
pause
endlocal
