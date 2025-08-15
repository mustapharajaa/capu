const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

// Simple zip extraction function for Windows
function extractZip(zipPath, extractPath) {
    try {
        // Use PowerShell to extract zip on Windows
        const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`;
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (error) {
        console.error('Zip extraction failed:', error.message);
        return false;
    }
}

console.log('🚀 CapCut Automation Setup');
console.log('========================');

const isWindows = os.platform() === 'win32';
const binDir = path.join(__dirname, 'bin');
const envPath = path.join(__dirname, '.env');

// Create bin directory
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
    console.log('📁 Created bin directory');
}

async function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`📥 Downloading ${path.basename(outputPath)}...`);
        const file = fs.createWriteStream(outputPath);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirects
                return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`✅ Downloaded ${path.basename(outputPath)}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => {}); // Delete partial file
            reject(err);
        });
    });
}

async function setupWindows() {
    console.log('🪟 Setting up for Windows...');
    
    const ytdlpPath = path.join(binDir, 'yt-dlp.exe');
    const ffmpegDir = path.join(binDir, 'ffmpeg');
    const ffmpegPath = path.join(ffmpegDir, 'ffmpeg.exe');
    
    try {
        // Download yt-dlp
        if (!fs.existsSync(ytdlpPath)) {
            await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ytdlpPath);
        } else {
            console.log('✅ yt-dlp already exists');
        }
        
        // Download FFmpeg directly
        if (!fs.existsSync(ffmpegPath)) {
            console.log('📥 Downloading FFmpeg for Windows...');
            const ffmpegZipPath = path.join(binDir, 'ffmpeg.zip');
            
            try {
                // Download FFmpeg essentials build
                await downloadFile('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', ffmpegZipPath);
                
                console.log('📦 Extracting FFmpeg...');
                const tempExtractDir = path.join(binDir, 'temp_ffmpeg');
                
                // Extract zip file
                if (extractZip(ffmpegZipPath, tempExtractDir)) {
                    console.log('✅ FFmpeg extracted successfully');
                    
                    // Find the ffmpeg.exe in the extracted folder structure
                    const findFFmpegExe = (dir) => {
                        const items = fs.readdirSync(dir);
                        for (const item of items) {
                            const fullPath = path.join(dir, item);
                            if (fs.statSync(fullPath).isDirectory()) {
                                const result = findFFmpegExe(fullPath);
                                if (result) return result;
                            } else if (item === 'ffmpeg.exe') {
                                return fullPath;
                            }
                        }
                        return null;
                    };
                    
                    const ffmpegExePath = findFFmpegExe(tempExtractDir);
                    if (ffmpegExePath) {
                        // Create ffmpeg directory and copy executable
                        if (!fs.existsSync(ffmpegDir)) {
                            fs.mkdirSync(ffmpegDir, { recursive: true });
                        }
                        fs.copyFileSync(ffmpegExePath, ffmpegPath);
                        console.log('✅ FFmpeg installed successfully');
                    } else {
                        throw new Error('Could not find ffmpeg.exe in extracted files');
                    }
                } else {
                    throw new Error('Failed to extract FFmpeg zip file');
                }
                
                // Clean up
                if (fs.existsSync(tempExtractDir)) {
                    fs.rmSync(tempExtractDir, { recursive: true, force: true });
                }
                if (fs.existsSync(ffmpegZipPath)) {
                    fs.unlinkSync(ffmpegZipPath);
                }
            } catch (error) {
                console.log('⚠️  FFmpeg download failed, using npm package fallback');
                console.log('   Using @ffmpeg-installer/ffmpeg package instead');
                
                // Try to use npm FFmpeg package
                try {
                    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                    if (ffmpegInstaller.path) {
                        console.log('✅ Using npm FFmpeg package');
                    } else {
                        console.log('⚠️  npm FFmpeg package not found, will use fallback path in .env');
                    }
                } catch (npmError) {
                    console.log('⚠️  npm FFmpeg package not available');
                }
            }
        } else {
            console.log('✅ FFmpeg already exists');
        }
        
        // Read existing .env file to preserve other settings
        let existingEnvContent = '';
        if (fs.existsSync(envPath)) {
            existingEnvContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Update or add FFmpeg and yt-dlp paths
        let envLines = existingEnvContent.split('\n');
        
        // Remove existing YTDLP_PATH and FFMPEG_PATH lines
        envLines = envLines.filter(line => 
            !line.startsWith('YTDLP_PATH=') && 
            !line.startsWith('FFMPEG_PATH=')
        );
        
        // Add updated paths
        envLines.push(`YTDLP_PATH=${ytdlpPath.replace(/\\/g, '\\\\')}`);
        
        // Use npm FFmpeg package path if direct download failed
        if (fs.existsSync(ffmpegPath)) {
            envLines.push(`FFMPEG_PATH=${ffmpegPath.replace(/\\/g, '\\\\')}`);
        } else {
            try {
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                if (ffmpegInstaller.path) {
                    envLines.push(`FFMPEG_PATH=${ffmpegInstaller.path.replace(/\\/g, '\\\\')}`);
                    console.log('✅ Using npm FFmpeg package path in .env');
                }
            } catch (npmError) {
                envLines.push('# FFMPEG_PATH=C:\\\\path\\\\to\\\\ffmpeg.exe');
                console.log('⚠️  Please manually set FFMPEG_PATH in .env file');
            }
        }
        
        // Add default settings if they don't exist
        if (!existingEnvContent.includes('DOWNLOAD_QUALITY=')) {
            envLines.push('DOWNLOAD_QUALITY=bestvideo[height<=1080]+bestaudio');
        }
        if (!existingEnvContent.includes('DOWNLOAD_FORMAT=')) {
            envLines.push('DOWNLOAD_FORMAT=bestvideo[height<=1080]+bestaudio/best[height<=1080]');
        }
        
        // Write updated .env file
        const finalEnvContent = envLines.filter(line => line.trim() !== '').join('\n') + '\n';
        fs.writeFileSync(envPath, finalEnvContent);
        console.log('✅ Updated .env file with FFmpeg and yt-dlp paths');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

async function setupLinux() {
    console.log('🐧 Setting up for Linux...');
    
    try {
        // Try to install yt-dlp
        console.log('📥 Installing yt-dlp...');
        try {
            execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp', { stdio: 'inherit' });
            execSync('chmod a+rx /usr/local/bin/yt-dlp', { stdio: 'inherit' });
            console.log('✅ yt-dlp installed');
        } catch (error) {
            console.log('⚠️  Could not install yt-dlp globally. Downloading to local bin...');
            const ytdlpPath = path.join(binDir, 'yt-dlp');
            await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', ytdlpPath);
            execSync(`chmod +x ${ytdlpPath}`);
        }
        
        // Try to install FFmpeg
        console.log('📥 Installing FFmpeg...');
        try {
            execSync('sudo apt update && sudo apt install -y ffmpeg', { stdio: 'inherit' });
            console.log('✅ FFmpeg installed');
        } catch (error) {
            console.log('⚠️  Could not install FFmpeg. Please install manually: sudo apt install ffmpeg');
        }
        
        // Read existing .env file to preserve other settings
        let existingEnvContent = '';
        if (fs.existsSync(envPath)) {
            existingEnvContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Update or add FFmpeg and yt-dlp paths
        let envLines = existingEnvContent.split('\n');
        
        // Remove existing YTDLP_PATH and FFMPEG_PATH lines
        envLines = envLines.filter(line => 
            !line.startsWith('YTDLP_PATH=') && 
            !line.startsWith('FFMPEG_PATH=')
        );
        
        // Add updated paths
        envLines.push('YTDLP_PATH=/usr/local/bin/yt-dlp');
        envLines.push('FFMPEG_PATH=/usr/bin/ffmpeg');
        
        // Add default settings if they don't exist
        if (!existingEnvContent.includes('DOWNLOAD_QUALITY=')) {
            envLines.push('DOWNLOAD_QUALITY=bestvideo[height<=1080]+bestaudio');
        }
        if (!existingEnvContent.includes('DOWNLOAD_FORMAT=')) {
            envLines.push('DOWNLOAD_FORMAT=bestvideo[height<=1080]+bestaudio/best[height<=1080]');
        }
        
        // Write updated .env file
        const finalEnvContent = envLines.filter(line => line.trim() !== '').join('\n') + '\n';
        fs.writeFileSync(envPath, finalEnvContent);
        console.log('✅ Updated .env file with FFmpeg and yt-dlp paths');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

async function main() {
    try {
        if (isWindows) {
            await setupWindows();
        } else {
            await setupLinux();
        }
        
        console.log('\n🎉 Setup completed successfully!');
        console.log('📋 Next steps:');
        console.log('   1. Run: npm start');
        console.log('   2. Open http://localhost:3000');
        console.log('\n💡 Configuration:');
        console.log('   - FFmpeg and yt-dlp paths updated in .env');
        console.log('   - Google Sheets integration ready (configure in .env if needed)');
        console.log('   - Batch processing enabled');
        console.log('\n📁 Files created:');
        console.log('   - bin/yt-dlp.exe (Windows) or yt-dlp (Linux)');
        console.log('   - bin/ffmpeg/ffmpeg.exe (Windows) or system FFmpeg (Linux)');
        console.log('   - Updated .env with correct paths');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
