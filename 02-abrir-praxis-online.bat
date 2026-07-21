@echo off
chcp 65001 >nul
title Práxis Online
cd /d "%~dp0"

if not exist "node_modules" (
  echo Os componentes ainda não foram instalados.
  echo Execute primeiro 01-instalar-online.bat
  pause
  exit /b 1
)

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:1420"
echo Iniciando o Práxis Online...
echo Mantenha esta janela aberta enquanto estiver usando o sistema.
echo Para encerrar, pressione Ctrl+C ou feche esta janela.
echo.
call npm run dev -- --host 127.0.0.1

