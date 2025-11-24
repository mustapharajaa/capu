@echo off
echo 🔧 Fixing CapCut Automation Dependencies...
echo ===========================================

set BIN_DIR=%~dp0..\bin
set YTDLP_EXE=%BIN_DIR%\yt-dlp.exe

if exist "%YTDLP_EXE%" (
    echo 🗑️  Deleting existing yt-dlp.exe (potentially corrupted)...
    del "%YTDLP_EXE%"
) else (
    echo ℹ️  yt-dlp.exe not found (will be downloaded)
)

echo.
echo 🚀 Running setup script to redownload dependencies...
cd /d "%~dp0.."
node scripts/setup.js

echo.
echo ✅ Fix complete! Please try running 'npm start' again.
pause
