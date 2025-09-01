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

            // Check if video was already processed successfully
            const videosJsonPath = path.join(__dirname, 'videos.json');
            if (fs.existsSync(videosJsonPath)) {
                try {
                    const videosData = JSON.parse(fs.readFileSync(videosJsonPath, 'utf8'));
                    const existingVideo = videosData.videos?.find(v => v.url === url && v.status === 'downloaded');
                    if (existingVideo) {
                        const existingPath = path.join(UPLOADS_DIR, existingVideo.filename);
                        if (fs.existsSync(existingPath)) {
                            console.log(`✅ Video already downloaded: ${existingVideo.filename}`);
                            if (progressCallback) progressCallback({ message: `Already downloaded: ${existingVideo.filename}`, progress: 100, isComplete: true, finalPath: existingPath });
                            resolve(existingPath);
                            return;
                        }
                    }
                } catch (error) {
                    console.log('⚠️ Could not check existing downloads, proceeding with download...');
                }
            }

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

            // Check for duplicate filenames and add numbering if needed
            let outputFilename = `${sanitizedTitle}.mp4`;
            let baseFilename = sanitizedTitle;
            let counter = 1;
            
            // Keep checking until we find a unique filename
            while (fs.existsSync(path.join(UPLOADS_DIR, outputFilename))) {
                outputFilename = `${baseFilename} (${counter}).mp4`;
                counter++;
            }
            
            const outputPath = path.join(UPLOADS_DIR, outputFilename);
            const infoJsonName = outputFilename.replace('.mp4', '.info.json');
            const infoJsonPath = path.join(UPLOADS_DIR, infoJsonName);

            // Save the metadata we already fetched to the .info.json file
            fs.writeFileSync(infoJsonPath, JSON.stringify(metadata, null, 2));
            console.log(`Saved .info.json to ${infoJsonPath}`);
            
            // Extract resolution info from metadata for display
            const height = metadata.height || 'Unknown';
            const width = metadata.width || 'Unknown';
            // For vertical videos (height > width), use width for resolution label
            const resolutionValue = width > height ? height : width;
            const resolution = resolutionValue !== 'Unknown' ? `${resolutionValue}p` : 'Unknown';
            console.log(`📺 Video Resolution: ${width}x${height} (${resolution})`);

            // Check video duration and apply random trimming for long videos
            const duration = metadata.duration || 0;
            const durationMinutes = Math.floor(duration / 60);
            console.log(`⏱️ Video Duration: ${durationMinutes} minutes`);

            let formatArgs = ['bestvideo+bestaudio/best'];
            
            if (duration > 3600) { // Over 1 hour (3600 seconds)
                // Generate random duration between 37-49 minutes
                const minDuration = 49 * 60; // 37 minutes in seconds
                const maxDuration = 63 * 60; // 49 minutes in seconds
                const randomDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
                const randomMinutes = Math.floor(randomDuration / 60);
                
                // Random start time (ensure we don't exceed video length)
                const maxStartTime = duration - randomDuration;
                const startTime = Math.floor(Math.random() * maxStartTime);
                const endTime = startTime + randomDuration;
                
                console.log(`✂️ Long video detected (${durationMinutes}min) - trimming to ${randomMinutes}min`);
                console.log(`📍 Trim: ${Math.floor(startTime/60)}:${String(startTime%60).padStart(2,'0')} - ${Math.floor(endTime/60)}:${String(endTime%60).padStart(2,'0')}`);
                
                formatArgs = [
                    'bestvideo+bestaudio/best',
                    '--postprocessor-args', `ffmpeg:-ss ${startTime} -t ${randomDuration} -avoid_negative_ts make_zero -map 0:v:0? -map 0:a:0? -c:v copy -c:a aac`
                ];
            }

            // Download best available quality (no resolution limit)
            const ytdlpArgs = [
                '--format', formatArgs[0],
                '--output', outputPath,
                '--no-playlist',
                '--write-info-json',
                '--ffmpeg-location', FFMPEG_PATH,
                '--merge-output-format', 'mp4',
                '--no-part',  // Avoid .part files that can cause access issues
                '--retries', '5',  // Retry failed downloads
                '--fragment-retries', '5'  // Retry failed fragments
            ];

            // Add trimming args for long videos, otherwise use CapCut-optimized postprocessor args
            if (duration > 3600 && formatArgs.length > 1) {
                ytdlpArgs.push(formatArgs[1], formatArgs[2]); // Add --postprocessor-args with trimming
            } else {
                // Fast processing - no re-encoding
                ytdlpArgs.push('--postprocessor-args', 'ffmpeg:-c:v copy -c:a aac -strict -2');
            }
            
            // Add cookies if file exists (EXACTLY like reference app)
            if (fs.existsSync(cookiesPath)) {
                ytdlpArgs.push('--cookies', cookiesPath);
            } else {
                console.log('⚠️ No cookies file found - downloads may be limited by bot detection');
            }
            
            ytdlpArgs.push(url);

            console.log(`🔧 FFmpeg Path: ${FFMPEG_PATH}`);
            console.log(`Executing: ${YTDLP_BINARY_PATH} ${ytdlpArgs.join(' ')}`);
            
            // Format checking removed for cleaner output
            
            if (progressCallback) progressCallback({ message: 'Starting download...' });

            // Suppress ytdlp console output
            const originalWrite = process.stdout.write;
            const originalLog = console.log;
            let progressLine = '';
            
            // Override console methods to filter ytdlp output but allow format info
            process.stdout.write = function(chunk, ...args) {
                const str = chunk.toString();
                // Allow our progress line, format info, and important messages
                if (str.startsWith('\r📥 Downloading:') || 
                    !str.includes('Download Progress:') ||
                    str.includes('[info]') ||
                    str.includes('[Merger]') ||
                    str.includes('format')) {
                    return originalWrite.call(this, chunk, ...args);
                }
                return true;
            };
            
            console.log = function(...args) {
                const str = args.join(' ');
                // Allow format info, merger info, and important logs
                if (!str.includes('Download Progress:') || 
                    str.includes('[info]') ||
                    str.includes('[Merger]') ||
                    str.includes('format') ||
                    str.includes('Downloading 1 format') ||
                    str.includes('Merging formats')) {
                    return originalLog.apply(this, args);
                }
            };

            ytDlpWrap.exec(ytdlpArgs)
                .on('progress', (progress) => {
                    const percent = progress.percent ? progress.percent.toFixed(1) : 0;
                    const speed = progress.currentSpeed || 'N/A';
                    const message = `📥 Downloading: ${percent}% | ${speed}`;
                    
                    // Single line progress like npm
                    process.stdout.write(`\r${message.padEnd(50)}`);
                    
                    if (progressCallback) progressCallback({ message: `Downloading... ${percent}% at ${speed}`, progress: percent });
                })
                .on('ytDlpEvent', (eventType, eventData) => {
                    // Show format selection with resolution info
                    if (eventType === 'info' && eventData.includes('Downloading 1 format')) {
                        // Extract format numbers and show with resolution
                        const formatMatch = eventData.match(/Downloading 1 format\(s\): (.+)/);
                        if (formatMatch) {
                            const formats = formatMatch[1];
                            console.log(`📋 Selected formats: ${formats} (${resolution})`);
                        } else {
                            console.log(`📋 ${eventData}`);
                        }
                    }
                    
                    if (eventType === 'Merger' || eventData.includes('Merging formats')) {
                        console.log(`🔧 FFmpeg: ${eventData}`);
                    }
                    
                    if (progressCallback) progressCallback({ message: `[${eventType}] ${eventData}` });
                })
                .on('error', (error) => {
                    // Restore original console methods on error
                    process.stdout.write = originalWrite;
                    console.log = originalLog;
                    
                    console.error('Error during download:', error);
                    if (progressCallback) progressCallback({ message: `Error: ${error.message}` });
                    reject(error);
                })
                .on('close', () => {
                    // Restore original console methods
                    process.stdout.write = originalWrite;
                    console.log = originalLog;
                    
                    console.log(`\n✅ Download finished: ${outputPath}`);
            updateVideosJson(sanitizedTitle, metadata.description, 'downloaded', timestamp, outputFilename, url);
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

function updateVideosJson(videoName, description, status, timestamp, filename, url) {
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

    // Check for duplicates before adding (by URL or filename)
    const existingVideo = videosData.videos.find(v => v.filename === filename || v.url === url);
    if (!existingVideo) {
        videosData.videos.push({
            name: videoName,
            description: description || '',
            status: status,
            timestamp: timestamp,
            filename: filename,
            url: url
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
