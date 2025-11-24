@echo off
echo ========================================
echo CapCut Automation - Complete Setup
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js not found. Installing Node.js...
    powershell -ExecutionPolicy Bypass -File "%~dp0install-nodejs.ps1"
    
    REM Check if installation succeeded
    where node >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Node.js installation failed!
        echo Please install Node.js manually from: https://nodejs.org/
        pause
        exit /b 1
    )
    
    echo Node.js installed successfully!
    echo.
) else (
    echo Node.js is already installed.
    node --version
    echo.
)

REM Clean npm cache
echo Cleaning npm cache...
call npm cache clean --force

REM Install dependencies
echo Installing dependencies...
call npm install

REM Run setup script
echo Running setup script...
node "%~dp0setup.js"

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Run: npm start
echo   2. Open: http://localhost:3000
echo.
pause
