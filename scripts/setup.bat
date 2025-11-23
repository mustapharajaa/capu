@echo off
echo.
echo ========================================
echo   CapCut Automation Setup (Windows)
echo   TRUE ONE-CLICK INSTALLER
echo ========================================
echo.

echo Creating configuration files first...

REM Create configuration files BEFORE anything else
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul 2>&1
        echo   - .env created from .env.example
    ) else (
        echo   - WARNING: .env.example not found, cannot create .env
    )
) else (
    echo   - .env already exists
)

if not exist "editors.json" (
    if exist "editors.json.example" (
        copy "editors.json.example" "editors.json" >nul 2>&1
        echo   - editors.json created from editors.json.example
    ) else (
        echo   - WARNING: editors.json.example not found, cannot create editors.json
    )
) else (
    echo   - editors.json already exists
)

if not exist "new videos" (
    if exist "new videos.example" (
        copy "new videos.example" "new videos" >nul 2>&1
        echo   - 'new videos' file created from example
    ) else (
        echo   - WARNING: 'new videos.example' not found, cannot create 'new videos'
    )
) else (
    echo   - 'new videos' file already exists
)

if not exist "youtube-cookies.txt" (
    if exist "youtube-cookies.txt.example" (
        copy "youtube-cookies.txt.example" "youtube-cookies.txt" >nul 2>&1
        echo   - youtube-cookies.txt created from example
    ) else (
        echo   - WARNING: youtube-cookies.txt.example not found, cannot create youtube-cookies.txt
    )
) else (
    echo   - youtube-cookies.txt already exists
)

if not exist "capcut-sheet-service-account.json" (
    if exist "capcut-sheet-service-account.json.example" (
        copy "capcut-sheet-service-account.json.example" "capcut-sheet-service-account.json" >nul 2>&1
        echo   - capcut-sheet-service-account.json created from example
    ) else (
        echo   - WARNING: capcut-sheet-service-account.json.example not found, cannot create capcut-sheet-service-account.json
    )
) else (
    echo   - capcut-sheet-service-account.json already exists
)

if not exist "cookies.json" (
    if exist "cookies.json.example" (
        copy "cookies.json.example" "cookies.json" >nul 2>&1
        echo   - cookies.json created from example
    ) else (
        echo   - WARNING: cookies.json.example not found, cannot create cookies.json
    )
) else (
    echo   - cookies.json already exists
)

echo.
echo Configuration files created! Now checking Node.js...

REM Check if Node.js is installed (check multiple locations)
set "NODE_FOUND=0"

REM Try standard PATH first
node --version >nul 2>&1
if %errorlevel% equ 0 set "NODE_FOUND=1"

REM Try Program Files location
if %NODE_FOUND% equ 0 (
    "%ProgramFiles%\nodejs\node.exe" --version >nul 2>&1
    if %errorlevel% equ 0 set "NODE_FOUND=1"
)

REM Try Program Files (x86) location
if %NODE_FOUND% equ 0 (
    "%ProgramFiles(x86)%\nodejs\node.exe" --version >nul 2>&1
    if %errorlevel% equ 0 set "NODE_FOUND=1"
)

if %NODE_FOUND% equ 0 (
    echo Node.js not found. Installing Node.js...
    echo.
    echo Downloading Node.js LTS...
    
    REM Create temp directory
    if not exist "%temp%\capcut-setup" mkdir "%temp%\capcut-setup"
    
    REM Download Node.js installer using PowerShell
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi' -OutFile '%temp%\capcut-setup\nodejs.msi'}"
    
    if exist "%temp%\capcut-setup\nodejs.msi" (
        echo Installing Node.js...
        msiexec /i "%temp%\capcut-setup\nodejs.msi" /quiet /norestart
        
        echo Waiting for Node.js installation to complete...
        timeout /t 30 /nobreak >nul
        
        REM Refresh environment variables and PATH
        call refreshenv >nul 2>&1
        
        REM Add Node.js to PATH for current session (multiple possible locations)
        set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
        
        REM Wait a bit more for installation to fully complete
        timeout /t 10 /nobreak >nul
        
        echo Node.js installation completed!
        echo.
        echo IMPORTANT: Node.js has been installed successfully!
        echo Please close this window and run setup.bat again to continue.
        echo.
        echo Next: Close this window, then run: .\setup.bat
        echo.
        
        REM Clean up
        del "%temp%\capcut-setup\nodejs.msi" >nul 2>&1
        rmdir "%temp%\capcut-setup" >nul 2>&1
        
        pause
        exit /b 0
    ) else (
        echo Failed to download Node.js installer.
        echo Please install Node.js manually from https://nodejs.org/
        pause
        exit /b 1
    )
) else (
    echo Node.js is already installed.
)

echo.
echo Verifying Node.js installation...

REM Use the installed Node.js (try different paths)
if exist "%ProgramFiles%\nodejs\node.exe" (
    "%ProgramFiles%\nodejs\node.exe" --version
    "%ProgramFiles%\nodejs\npm.cmd" --version
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    "%ProgramFiles(x86)%\nodejs\node.exe" --version
    "%ProgramFiles(x86)%\nodejs\npm.cmd" --version
    set "PATH=%PATH%;%ProgramFiles(x86)%\nodejs"
) else (
    node --version
    npm --version
)

echo.
echo Installing Node.js dependencies...
echo DEBUG: About to run npm install...
call npm install
set NPM_EXIT_CODE=%errorlevel%
echo DEBUG: npm install completed with exit code: %NPM_EXIT_CODE%
if %NPM_EXIT_CODE% neq 0 (
    echo ERROR: npm install failed with code %NPM_EXIT_CODE%. Trying with full path...
    if exist "%ProgramFiles%\nodejs\npm.cmd" (
        call "%ProgramFiles%\nodejs\npm.cmd" install
        set NPM_EXIT_CODE=%errorlevel%
        echo DEBUG: Full path npm install completed with exit code: %NPM_EXIT_CODE%
    ) else (
        echo Please run manually: npm install
        echo Continuing with setup anyway...
    )
)
echo DEBUG: Continuing to FFmpeg installation...

echo.
echo Installing FFmpeg npm package (fallback for setup)...
call npm install @ffmpeg-installer/ffmpeg
set FFMPEG_EXIT_CODE=%errorlevel%
echo DEBUG: FFmpeg install completed with exit code: %FFMPEG_EXIT_CODE%
if %FFMPEG_EXIT_CODE% neq 0 (
    echo ERROR: FFmpeg install failed with code %FFMPEG_EXIT_CODE%. Trying with full path...
    if exist "%ProgramFiles%\nodejs\npm.cmd" (
        call "%ProgramFiles%\nodejs\npm.cmd" install @ffmpeg-installer/ffmpeg
        set FFMPEG_EXIT_CODE=%errorlevel%
        echo DEBUG: Full path FFmpeg install completed with exit code: %FFMPEG_EXIT_CODE%
    ) else (
        echo Please run manually: npm install @ffmpeg-installer/ffmpeg
        echo Continuing with setup anyway...
    )
)
echo DEBUG: Moving to configuration files creation...


echo.
echo Running automated setup...
node setup.js
if %errorlevel% neq 0 (
    echo ERROR: setup.js failed. Trying with full path...
    if exist "%ProgramFiles%\nodejs\node.exe" (
        "%ProgramFiles%\nodejs\node.exe" setup.js
    ) else (
        echo Please run manually: node setup.js
        pause
    )
)

echo.
echo Removing quotes from .env file paths...
powershell -Command "(Get-Content .env) -replace '\"([^\"]*?)\"', '$1' | Set-Content .env"
echo   - .env paths cleaned (quotes removed)

echo.
echo ========================================
echo   SETUP COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Edit .env file with your Google Sheets credentials
echo 2. Edit editors.json with your CapCut editor URLs
echo 3. Run: npm start
echo 4. Open: http://localhost:3000
echo.
echo Your CapCut automation system is ready!
echo.
pause
