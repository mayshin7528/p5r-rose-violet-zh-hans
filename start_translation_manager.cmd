@echo off
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto node_ready

set "NODE_EXE=%~dp0dist\Rose-Translation-Reviewer\node.exe"

if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js was not found.
  echo Install Node.js or rebuild dist\Rose-Translation-Reviewer first.
  pause
  exit /b 1
)

:node_ready
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4178'"
"%NODE_EXE%" tools\translation-manager\server.js
pause
