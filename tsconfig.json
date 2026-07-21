@echo off
chcp 65001 >nul
title Práxis Online - Instalação
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js não foi encontrado neste computador.
  echo Instale a versão LTS em https://nodejs.org/ e execute este arquivo novamente.
  pause
  exit /b 1
)

echo Instalando os componentes do Práxis Online...
call npm install
if errorlevel 1 (
  echo.
  echo Não foi possível concluir a instalação.
  pause
  exit /b 1
)

echo.
echo Instalação concluída com sucesso.
echo Agora execute 02-abrir-praxis-online.bat
pause

