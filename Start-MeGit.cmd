@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where git >nul 2>nul
if errorlevel 1 goto missing_git
node scripts/start.mjs
set "MEGIT_EXIT=%ERRORLEVEL%"
if not "%MEGIT_EXIT%"=="0" pause
exit /b %MEGIT_EXIT%

:missing_node
echo Node.js 22.12 or newer is required. Install it and reopen this launcher.
pause
exit /b 1

:missing_git
echo Git is required. Install it, add it to PATH, and reopen this launcher.
pause
exit /b 1
