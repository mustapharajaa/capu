# PowerShell script to download and install Node.js LTS
Write-Host "========================================" -ForegroundColor Green
Write-Host "Node.js Automatic Installation" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Node.js LTS version (v20.x)
$nodeVersion = "20.11.0"
$nodeInstallerUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi"
$installerPath = "$env:TEMP\nodejs-installer.msi"

try {
    Write-Host "Downloading Node.js v$nodeVersion..." -ForegroundColor Yellow
    
    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $nodeInstallerUrl -OutFile $installerPath -UseBasicParsing
    
    Write-Host "Download complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installing Node.js (this may take a few minutes)..." -ForegroundColor Yellow
    
    # Install silently
    Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /quiet /norestart" -Wait -NoNewWindow
    
    Write-Host "Installation complete!" -ForegroundColor Green
    Write-Host ""
    
    # Clean up installer
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    
    Write-Host "Refreshing environment variables..." -ForegroundColor Yellow
    
    # Refresh PATH for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host ""
    Write-Host "Node.js installation successful!" -ForegroundColor Green
    Write-Host "Please close and reopen PowerShell/Command Prompt for changes to take effect." -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Installation failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js manually from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
