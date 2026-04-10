@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   AA Translator 시작 중...
echo ============================================

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INSTALL] Installing dependencies...
    call npm install
)

echo [START] Running dev server...
start http://localhost:3000
call npm run dev

pause
