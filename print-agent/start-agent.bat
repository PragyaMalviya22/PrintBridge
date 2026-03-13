@echo off
title LabelForge Print Agent
echo.
echo   Starting LabelForge Print Agent...
echo   Press Ctrl+C to stop
echo.

REM ═══════════════════════════════════════════════
REM EDIT THESE VALUES:
REM ═══════════════════════════════════════════════
set CLOUD_URL=https://printiumprint.vercel.app
REM Your printer name (leave empty for auto-detect):
set PRINTER_NAME=

cd /d "%~dp0"
node agent.js
pause
