@echo off
setlocal
cd /d "%~dp0"
set HOST=0.0.0.0
echo Preview de desenvolvimento na porta 4173. Use HTTPS em producao.
call iniciar.bat
endlocal
