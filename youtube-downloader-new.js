const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config();
const YtDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg = require('@ffmpeg-installer/ffmpeg');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
// Get the yt-dlp binary path from environment variables
const YTDLP_BINARY_PATH = process.env.YTDLP_PATH;
if (!YTDLP_BINARY_PATH || !fs.existsSync(YTDLP_BINARY_PATH)) {
    throw new Error('YTDLP_PATH environment variable is not set or points to a non-existent file. Please check your .env file.');
}

const ytDlpWrap = new YtDlpWrap(YTDLP_BINARY_PATH);

// Version identifier for tracking deployments
console.log('🔧 YouTube Downloader Version: 2.0.0 - Reference App Compatible (2025-01-15)');

// Get the ffmpeg binary path from environment variables, with a fallback to the package
const FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpeg.path;
if (!FFMPEG_PATH || !fs.existsSync(FFMPEG_PATH)) {
    throw new Error('FFMPEG_PATH is not configured correctly. Please check your .env file or ensure the @ffmpeg-installer/ffmpeg package is installed.');
}

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function sanitizeFilename(title) {
    if (!title) return '';
    return title
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/[\x00-\x1f\x80-\x9f]/g, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2060-\u2064]/g, '')
        .replace(/\u00AD/g, '')
        .replace(/^\.|\.$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
}

async function downloadYouTubeVideo(url, progressCallback) {
    return new Promise(async (resolve, reject) => {
        try {
            const timestamp = Date.now();
            const cookiesPath = path.join(__dirname, 'youtube-cookies.txt');

            // Get video metadata first to get the title for the filename
            console.log('Fetching video metadata...');
            let metadata;
            
            // Use spawn to get metadata with cookies (like reference app)
            if (fs.existsSync(cookiesPath)) {
                console.log('🍪 Using YouTube cookies for authentication');
                const metadataArgs = [
                    '--dump-json',
                    '--cookies', cookiesPath,
                    url
                ];
                console.log(`Executing: ${YTDLP_BINARY_PATH} ${metadataArgs.join(' ')}`);
                
                const { execSync } = require('child_process');
                const metadataOutput = execSync(`"${YTDLP_BINARY_PATH}" --dump-json --cookies "${cookiesPath}" "${url}"`, { encoding: 'utf8' });
                metadata = JSON.parse(metadataOutput);
            } else {
                console.log('⚠️ No cookies file - metadata fetch may fail due to bot detection');
                metadata = await ytDlpWrap.getVideoInfo(url);
            }
            const sanitizedTitle = sanitizeFilename(metadata.title);

            // No timestamp - clean filename as requested
            const outputFilename = `${sanitizedTitle}.mp4`;
            
            const outputPath = path.join(UPLOADS_DIR, outputFilename);
            const infoJsonPath = path.join(UPLOADS_DIR, `${sanitizedTitle}.info.json`);

            // Save the metadata we already fetched to the .info.json file
            fs.writeFileSync(infoJsonPath, JSON.stringify(metadata, null, 2));
            console.log(`Saved .info.json to ${infoJsonPath}`);

            // Use EXACT same format as reference app
            const ytdlpArgs = [
                '--format', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
                '--output', outputPath,
                '--no-playlist',
                '--write-info-json',
                '--ffmpeg-location', FFMPEG_PATH,
                '--merge-output-format', 'mp4',
                '--postprocessor-args', 'ffmpeg:-c:v copy -c:a aac -strict -2'
            ];
            
            // Add cookies if file exists (EXACTLY like reference app)
            if (fs.existsSync(cookiesPath)) {
                ytdlpArgs.push('--cookies', cookiesPath);
            } else {
                console.log('⚠️ No cookies file found - downloads may be limited by bot detection');
            }
            
            ytdlpArgs.push(url);

            console.log(`🔧 FFmpeg Path: ${FFMPEG_PATH}`);
            console.log(`Executing: ${YTDLP_BINARY_PATH} ${ytdlpArgs.join(' ')}`);
            if (progressCallback) progressCallback({ message: 'Starting download...' });

            ytDlpWrap.exec(ytdlpArgs)
                .on('progress', (progress) => {
                    const percent = progress.percent ? progress.percent.toFixed(1) : 0;
                    const message = `Downloading... ${percent}% at ${progress.currentSpeed || 'N/A'}`;
                    if (progressCallback) progressCallback({ message: message, progress: percent });
                })
                .on('ytDlpEvent', (eventType, eventData) => {
                    console.log(`[${eventType}] ${eventData}`);
                    if (progressCallback) progressCallback({ message: `[${eventType}] ${eventData}` });
                })
                .on('error', (error) => {
                    console.error('Error during download:', error);
                    if (progressCallback) progressCallback({ message: `Error: ${error.message}` });
                    reject(error);
                })
                .on('close', () => {
                    console.log(`Download finished: ${outputPath}`);
                    updateVideosJson(sanitizedTitle, metadata.description, 'downloaded', timestamp, outputFilename);
                    if (progressCallback) progressCallback({ message: `DOWNLOADED: ${outputPath}`, progress: 100, isComplete: true, finalPath: outputPath });
                    resolve(outputPath);
                });

        } catch (error) {
            console.error('An error occurred in downloadYouTubeVideo:', error);
            if (progressCallback) progressCallback({ message: `Fatal Error: ${error.message}` });
            reject(error);
        }
    });
}

function updateVideosJson(videoName, description, status, timestamp, filename) {
    const videosJsonPath = path.join(__dirname, 'videos.json');
    let videosData = { videos: [] };

    if (fs.existsSync(videosJsonPath)) {
        try {
            const fileContent = fs.readFileSync(videosJsonPath, 'utf8');
            if (fileContent) {
                videosData = JSON.parse(fileContent);
                if (!Array.isArray(videosData.videos)) {
                    videosData.videos = [];
                }
            }
        } catch (error) {
            console.error('Error reading or parsing videos.json:', error);
            videosData.videos = [];
        }
    }

    // Check for duplicates before adding
    const existingVideo = videosData.videos.find(v => v.filename === filename);
    if (!existingVideo) {
        videosData.videos.push({
            name: videoName,
            description: description || '',
            status: status,
            timestamp: timestamp,
            filename: filename
        });
        fs.writeFileSync(videosJsonPath, JSON.stringify(videosData, null, 2));
        console.log(`Updated videos.json with new entry: ${videoName}`);
    }
}

async function getVideoInfo(url) {
    try {
        return await ytDlpWrap.getVideoInfo(url);
    } catch (error) {
        console.error(`Failed to get video info for ${url}:`, error);
        throw error;
    }
}

module.exports = {
    downloadYouTubeVideo,
    getVideoInfo
};
