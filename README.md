# CapCut Automation System

A comprehensive automation system for CapCut video processing with YouTube integration, background removal, and Google Sheets logging.

## Installation

download folder    https://github.com/mustapharajaa/capu
```cmd
in terminal not shell RUN THIS COMMANDS 

.\setup.bat
npm cache clean --force
npm install
node setup.js 

1, add your .env.exemple details to .env paths it auto update
2, edite google sheet key file  capcut-sheet-service-account.json
3, edit cookies.json.exemple for login capcut error
    ^in localhost:3000/go or rdpip/go^
4, editors.json & new videos & youtube-cookies.txt 
npm run start
```

⚠️ cookies ⚠️
1, Open a new private browsing/incognito window and log into YouTube
2, navigate to https://www.youtube.com/robots.txt (this should be the only private/incognito browsing tab open)
3, Export youtube.com cookies from the browser, then close the private browsing/incognito window so that the session is never opened in the browser again.


run rdp app in public commond

netsh advfirewall firewall add rule name="CapCut Automation Port 3000" dir=in action=allow protocol=TCP localport=3000



Open: http://localhost:3000

## 📋 Features

### ✅ Core Functionality
- **YouTube Video Download**: Automatic download with metadata
- **CapCut Integration**: Automated video upload and processing
- **Background Removal**: AI-powered background removal automation
- **Batch Processing**: Process multiple videos concurrently
- **Google Sheets Logging**: Automatic completion logging
- **Real-time Progress**: Live progress tracking and notifications

### ✅ Advanced Features
- **Multi-Editor Support**: Concurrent automation across multiple CapCut editors
- **Robust Error Handling**: Comprehensive error recovery and cleanup
- **File Management**: Automatic cleanup of processed files
- **Status Tracking**: Complete video lifecycle tracking
- **Browser Persistence**: Reusable browser sessions for efficiency

## 🔧 Configuration

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
