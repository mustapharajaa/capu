# CapCut Automation System

A comprehensive automation system for CapCut video processing with YouTube integration, background removal, and Google Sheets logging.

## Installation

download folder    https://github.com/mustapharajaa/capu

download chrome and yt dlp 

in terminal not shell RUN THIS COMMANDS 

.\setup.bat
npm cache clean --force
npm install
node setup.js 
                      if any package error  run rmdir /s /q node_modules

                  1 set PUPPETEER_EXECUTABLE_PATH=
                 2 set PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
                      
1, edit .env details                                       

FFMPEG_PATH= #FFMPEG_PATH will use npm package fallback - comment out or remove the line above

2, npm run start

    ^in localhost:3000/go or rdpip/go^
3, editors.json & new videos & youtube-cookies.txt & google sheet  key & capcut cookies.json

4,npm run start
```

⚠️ youtube cookies ⚠️
1, Open a new private browsing/incognito window and log into YouTube
2, navigate to https://www.youtube.com/robots.txt (this should be the only private/incognito browsing tab open)
3, Export youtube.com cookies from the browser, then close the private browsing/incognito window so that the session is never opened in the browser again.


⚠️run rdp app in public commond⚠️

netsh advfirewall firewall add rule name="CapCut Automation Port 3000" dir=in action=allow protocol=TCP localport=3000



You'll need to create a new firewall group for this server:

1, Go to Vultr Dashboard → Firewall Groups
2, Create New Firewall Group
3, Add IPv4 Rules:
accept TCP 3000 0.0.0.0/0 (Web App)




# CapCut Web Automation System

Automated video processing system for CapCut web editor with background removal capabilities.

## Features

- **YouTube Video Download**: Automatically download videos from YouTube URLs
- **Batch Processing**: Process multiple videos from a queue file
- **Background Removal**: Automatic background removal using CapCut's AI tools with progress monitoring (0-100%)
- **Google Sheets Integration**: Log completed videos to Google Sheets
- **Concurrent Processing**: Process up to 3 videos simultaneously
- **RDP Compatible**: Works reliably in Remote Desktop environments
- **Web Interface**: Monitor and control the automation through a web UI
- **Auto Setup**: One-click setup that installs Node.js, Chrome, yt-dlp, and FFmpeg

## Quick Start (⚡ Fully Automated)

### Windows - Complete Auto-Setup

**Just run ONE command and everything installs automatically!**

1. **Download or clone the project**:
   ```bash
   # Option 1: Download ZIP from GitHub and extract
   # Option 2: Clone with git
   git clone https://github.com/mustapharajaa/capu.git
   cd capu
   ```

2. **Run the automated setup** (installs EVERYTHING):
   ```bash
   scripts\setup.bat
   ```
   
   ✅ This ONE command automatically:
   - ✅ Downloads and installs **Node.js v20** (if not installed)
   - ✅ Installs all **npm dependencies**
   - ✅ Downloads **Chrome for Testing**
   - ✅ Downloads **yt-dlp** and **FFmpeg**
   - ✅ Configures all paths in `.env`
   
   **Note**: After Node.js installation, you may need to close and reopen your terminal, then run `scripts\setup.bat` again.

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Open your browser**:
   - Main interface: http://localhost:3000
   - Management page: http://localhost:3000/go

### Fresh RDP Server Setup

If you're on a **completely fresh Windows RDP server** with nothing installed:

1. Open PowerShell as Administrator
2. Navigate to the project folder
3. Run:
   ```powershell
   scripts\setup.bat
   ```

That's it! Everything will be installed automatically.n

### Environment Variables (.env)
The setup script automatically configures these, but you can customize:

```env
# Automatically configured by setup.js
YTDLP_PATH=./bin/yt-dlp.exe
FFMPEG_PATH=./bin/ffmpeg/ffmpeg.exe

# Google Sheets Integration (optional)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SHEET_NAME=Sheet1

# Server Configuration
PORT=3000
batch-processor=true

# Download Quality
DOWNLOAD_QUALITY=bestvideo[height<=1080]+bestaudio
DOWNLOAD_FORMAT=bestvideo[height<=1080]+bestaudio/best[height<=1080]
```

### Editor Configuration (editors.json)
Add your CapCut editor URLs:
```json
[
    {
        "url": "https://www.capcut.com/editor/YOUR-EDITOR-ID",
        "status": "available",
        "lastRun": "",
        "result": "",
        "errorType": ""
    }
]
```

## 📁 File Structure

```
CAPCUT-AUTO - Copy (2)/
├── setup.bat              # One-click installer (Windows)
├── setup.js               # Automated setup script
├── server.js              # Main application server
├── timeline_test.js       # CapCut automation engine
├── batch-processor.js     # Batch processing logic
├── google-sheets-service.js # Google Sheets integration
├── editors.json           # Editor configuration
├── videos.json            # Video metadata storage
├── new videos             # Queue file for batch processing
├── .env                   # Environment configuration
├── bin/                   # Downloaded executables
│   ├── yt-dlp.exe         # YouTube downloader
│   └── ffmpeg/            # FFmpeg installation
├── uploads/               # Processed video storage
└── downloads/             # Downloaded video storage
```

## 🎯 Usage

### 1. Single Video Processing
1. Open `http://localhost:3000`
2. Upload a video file or paste YouTube URL
3. Click "Process Video" or "Convert"
4. Monitor real-time progress
5. Download processed result

### 2. Batch Processing
1. Add YouTube URLs to the "new videos" file (one per line)
2. The system automatically processes all videos in queue
3. Monitor progress through the web interface
4. Results are logged to Google Sheets (if configured)

### 3. Video Management
- View all videos at `http://localhost:3000/videos`
- Track processing status (downloaded → rmbg → complete)
- Reuse existing videos for reprocessing
- View video information and descriptions

## 🛠️ Troubleshooting

### Common Issues

**Setup fails to download FFmpeg:**
- The setup script will fallback to npm FFmpeg package
- Manually download FFmpeg and update FFMPEG_PATH in .env

**yt-dlp download fails:**
- Check internet connection
- Manually download from GitHub releases and place in bin/

**CapCut automation fails:**
- Ensure editors.json has valid CapCut editor URLs
- Check that editors are not already in use
- Verify browser can access CapCut website

**Google Sheets logging fails:**
- Verify service account credentials
- Check spreadsheet permissions
- Ensure GOOGLE_SPREADSHEET_ID is correct

### Debug Mode
Enable verbose logging by setting environment variables:
```cmd
set DEBUG=capcut:*
npm start
```

## 🔒 Security

- Service account credentials stored locally
- No sensitive data transmitted externally
- Browser sessions isolated per automation
- Automatic cleanup of temporary files

## 📊 System Requirements

- **OS**: Windows 10/11 (primary), Linux (supported)
- **Node.js**: 14.x or higher
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space for dependencies
- **Network**: Stable internet for YouTube downloads

## 🆘 Support

For issues or questions:
1. Check the console output for error messages
2. Verify .env configuration
3. Ensure all dependencies are installed
4. Check editors.json for valid URLs

## 📈 Performance

- **Concurrent Processing**: Up to N videos (N = number of available editors)
- **Download Speed**: Limited by network bandwidth
- **Processing Time**: ~2-5 minutes per video (depending on length)
- **Memory Usage**: ~500MB per concurrent automation

---

**Ready to automate your video processing workflow!** 🎬✨
