# CapCut Automation PowerShell Setup

# Function to check if a command is available
function Test-CommandExists {
    param($command)
    return (Get-Command $command -ErrorAction SilentlyContinue) -ne $null
}

# Function to test Node.js in multiple locations
function Test-NodeJS {
    # Try standard PATH first
    if (Test-CommandExists node) {
        return $true
    }
    
    # Try Program Files location
    if (Test-Path "$env:ProgramFiles\nodejs\node.exe") {
        return $true
    }
    
    # Try Program Files (x86) location
    if (Test-Path "${env:ProgramFiles(x86)}\nodejs\node.exe") {
        return $true
    }
    
    return $false
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  CapCut Automation Setup (PowerShell)" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# 1. Check for Node.js (robust detection)
if (-not (Test-NodeJS)) {
    Write-Host "Node.js not found. Starting installation..." -ForegroundColor Yellow
    Write-Host "Downloading Node.js LTS..." -ForegroundColor Cyan
    
    $tempDir = Join-Path $env:TEMP "capcut-setup"
    if (-not (Test-Path $tempDir)) { New-Item -Path $tempDir -ItemType Directory | Out-Null }
    
    $nodeInstallerPath = Join-Path $tempDir "nodejs.msi"
    $nodeUrl = "https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi"
    
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstallerPath
    } catch {
        Write-Host "ERROR: Failed to download Node.js installer." -ForegroundColor Red
        Write-Host "Please install Node.js manually from https://nodejs.org/"
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Write-Host "Installing Node.js silently..." -ForegroundColor Cyan
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstallerPath`" /quiet /norestart" -Wait
    
    Write-Host "Node.js installation completed!" -ForegroundColor Green
    Write-Host "" -ForegroundColor Yellow
    Write-Host "IMPORTANT: Please CLOSE this PowerShell window and OPEN A NEW ONE." -ForegroundColor Yellow
    Write-Host "Then, navigate back to this directory and run '..\setup.ps1' again." -ForegroundColor Yellow
    
    Remove-Item $nodeInstallerPath, $tempDir -Recurse -Force
    Read-Host "Press Enter to exit"
    exit 0
} else {
    Write-Host "Node.js is already installed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Verifying Node.js installation..." -ForegroundColor Cyan

# Use the installed Node.js (try different paths)
if (Test-Path "$env:ProgramFiles\nodejs\node.exe") {
    & "$env:ProgramFiles\nodejs\node.exe" --version
    & "$env:ProgramFiles\nodejs\npm.cmd" --version
    $env:PATH = "$env:PATH;$env:ProgramFiles\nodejs"
} elseif (Test-Path "${env:ProgramFiles(x86)}\nodejs\node.exe") {
    & "${env:ProgramFiles(x86)}\nodejs\node.exe" --version
    & "${env:ProgramFiles(x86)}\nodejs\npm.cmd" --version
    $env:PATH = "$env:PATH;${env:ProgramFiles(x86)}\nodejs"
} else {
    node --version
    npm --version
}
Write-Host ""

# 2. Install dependencies with fallback logic
Write-Host "Installing Node.js dependencies..." -ForegroundColor Cyan
Write-Host "DEBUG: About to run npm install..." -ForegroundColor Gray

npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed. Trying with full path..." -ForegroundColor Yellow
    if (Test-Path "$env:ProgramFiles\nodejs\npm.cmd") {
        & "$env:ProgramFiles\nodejs\npm.cmd" install
    } elseif (Test-Path "${env:ProgramFiles(x86)}\nodejs\npm.cmd") {
        & "${env:ProgramFiles(x86)}\nodejs\npm.cmd" install
    } else {
        Write-Host "ERROR: Could not find npm. Please run manually: npm install" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}
Write-Host "DEBUG: npm install completed with exit code: $LASTEXITCODE" -ForegroundColor Gray

Write-Host ""
Write-Host "Installing FFmpeg npm package (fallback for setup)..." -ForegroundColor Cyan
npm install @ffmpeg-installer/ffmpeg
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: FFmpeg install failed. Trying with full path..." -ForegroundColor Yellow
    if (Test-Path "$env:ProgramFiles\nodejs\npm.cmd") {
        & "$env:ProgramFiles\nodejs\npm.cmd" install @ffmpeg-installer/ffmpeg
    } elseif (Test-Path "${env:ProgramFiles(x86)}\nodejs\npm.cmd") {
        & "${env:ProgramFiles(x86)}\nodejs\npm.cmd" install @ffmpeg-installer/ffmpeg
    } else {
        Write-Host "ERROR: Could not find npm for FFmpeg install. Please run manually: npm install @ffmpeg-installer/ffmpeg" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "Running automated setup script..." -ForegroundColor Cyan
node setup.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: setup.js failed. Trying with full path..." -ForegroundColor Yellow
    if (Test-Path "$env:ProgramFiles\nodejs\node.exe") {
        & "$env:ProgramFiles\nodejs\node.exe" setup.js
    } elseif (Test-Path "${env:ProgramFiles(x86)}\nodejs\node.exe") {
        & "${env:ProgramFiles(x86)}\nodejs\node.exe" setup.js
    } else {
        Write-Host "ERROR: Could not find node.exe. Please run manually: node setup.js" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "Creating configuration files..." -ForegroundColor Cyan

# Validate and create .env file
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  - .env created from .env.example" -ForegroundColor Green
    } else {
        Write-Host "  - WARNING: .env.example not found, cannot create .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "  - .env already exists" -ForegroundColor Green
}

# Validate and create editors.json file
if (-not (Test-Path "editors.json")) {
    if (Test-Path "editors.json.example") {
        Copy-Item "editors.json.example" "editors.json"
        Write-Host "  - editors.json created from editors.json.example" -ForegroundColor Green
    } else {
        Write-Host "  - WARNING: editors.json.example not found, cannot create editors.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "  - editors.json already exists" -ForegroundColor Green
}

# Validate and create new videos file
if (-not (Test-Path "new videos")) {
    if (Test-Path "new videos.example") {
        Copy-Item "new videos.example" "new videos"
        Write-Host "  - 'new videos' file created from example" -ForegroundColor Green
    } else {
        Write-Host "  - WARNING: 'new videos.example' not found, cannot create 'new videos'" -ForegroundColor Yellow
    }
} else {
    Write-Host "  - 'new videos' file already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "           SETUP COMPLETE!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env and editors.json with your settings."
Write-Host "2. Run: npm start"
Write-Host "3. Open your browser to: http://localhost:3000"
Write-Host ""
Read-Host "Press Enter to exit"
