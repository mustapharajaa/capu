# CapCut Automation System

A comprehensive automation system for CapCut video processing with YouTube integration, background removal, and Google Sheets logging.

## 🚀 Installation Guide

### Prerequisites
Before installing, ensure you have:
- **Node.js** (14.x or higher) - Download from [nodejs.org](https://nodejs.org/)
- **Git** (optional, for cloning) - Download from [git-scm.com](https://git-scm.com/)

### Method 1: Download from GitHub (Recommended)
1. **Download the repository:**
   - Go to https://github.com/mustapharajaa/capu
   - Click "Code" → "Download ZIP"
   - Extract to your desired location (e.g., `C:\capu`)

2. **Or clone with Git (if installed):**
   ```cmd
   git clone https://github.com/mustapharajaa/capu.git
   cd capu
   ```

### Method 2: One-Click Installation
1. **Navigate to the project folder:**
   ```cmd
   cd C:\path\to\capu
   ```

2. **Run the installer:**
   ```cmd
   setup.bat
   ```
   *This automatically installs all dependencies and configures paths*

3. **Configure your settings:**
   ```cmd
   copy .env.example .env
   copy editors.json.example editors.json
   ```

4. **Start the application:**
   ```cmd
   npm start
   ```

5. **Open your browser:**
   - Navigate to `http://localhost:3000`

### Method 3: Manual Installation (if setup.bat fails)
```cmd
npm install
npm install @ffmpeg-installer/ffmpeg
node setup.js
npm start
```

### Troubleshooting Common Issues

**"Git is not recognized":**
- Download ZIP from GitHub instead of cloning
- Or install Git from https://git-scm.com/

**"The system cannot find the path specified":**
- Use the correct path for your system
- Check if the folder exists: `dir C:\path\to\capu`

**"Node.js not found":**
- Install Node.js from https://nodejs.org/
- Restart command prompt after installation

**Setup fails:**
- Run as Administrator
- Check internet connection for downloads
- Use manual installation method

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
