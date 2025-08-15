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

            // Get video metadata first to get the title for the filename
            console.log('Fetching video metadata...');
            const metadata = await ytDlpWrap.getVideoInfo(url);
            const sanitizedTitle = sanitizeFilename(metadata.title);

            const outputFilename = `${sanitizedTitle}.mp4`;
            const outputPath = path.join(UPLOADS_DIR, outputFilename);
            const infoJsonPath = path.join(UPLOADS_DIR, `${sanitizedTitle}.info.json`);

            // Save the metadata we already fetched to the .info.json file
            fs.writeFileSync(infoJsonPath, JSON.stringify(metadata, null, 2));
            console.log(`Saved .info.json to ${infoJsonPath}`);

            // Real-time FFmpeg merging with yt-dlp piping
            console.log('🚀 Starting REAL-TIME FFmpeg merge...');
            if (progressCallback) progressCallback({ message: 'Starting real-time merge...' });

            await downloadWithFFmpegMerge(url, outputPath, progressCallback);
            
            console.log(`✅ Real-time merge completed: ${outputPath}`);
            updateVideosJson(sanitizedTitle, metadata.description, 'downloaded', timestamp, outputFilename);
            if (progressCallback) progressCallback({ message: `DOWNLOADED: ${outputPath}`, progress: 100, isComplete: true, finalPath: outputPath });
            resolve(outputPath);

        } catch (error) {
            console.error('An error occurred in downloadYouTubeVideo:', error);
            if (progressCallback) progressCallback({ message: `Fatal Error: ${error.message}` });
            reject(error);
        }
    });
}

async function downloadWithFFmpegMerge(url, outputPath, progressCallback) {
    return new Promise((resolve, reject) => {
        console.log('🔥 Starting REAL-TIME yt-dlp → FFmpeg pipeline...');
        
        // yt-dlp command to output merged video+audio stream to stdout
        const ytdlpArgs = [
            '--format', 'best[height<=1080]/bestvideo[height<=1080]+bestaudio/best',
            '--output', '-',  // Output to stdout
            '--no-playlist',
            '--merge-output-format', 'mp4',
            url
        ];

        // FFmpeg command to merge the streams in real-time
        const ffmpegArgs = [
            '-i', 'pipe:0',  // Read from stdin (yt-dlp output)
            '-c:v', 'copy',  // Copy video codec (no re-encoding)
            '-c:a', 'aac',   // Convert audio to AAC
            '-strict', '-2', // Allow experimental codecs (for Opus)
            '-y',            // Overwrite output file
            outputPath
        ];

        console.log(`🚀 yt-dlp: ${YTDLP_BINARY_PATH} ${ytdlpArgs.join(' ')}`);
        console.log(`🎬 FFmpeg: ${FFMPEG_PATH} ${ffmpegArgs.join(' ')}`);

        // Spawn yt-dlp process
        const ytdlp = spawn(YTDLP_BINARY_PATH, ytdlpArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Spawn FFmpeg process
        const ffmpegProcess = spawn(FFMPEG_PATH, ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Pipe yt-dlp output directly to FFmpeg input (REAL-TIME!)
        ytdlp.stdout.pipe(ffmpegProcess.stdin);
        
        // Handle yt-dlp stderr for progress
        ytdlp.stderr.on('data', (data) => {
            const output = data.toString();
            // Filter out binary noise, only show meaningful progress
            if (output.includes('[download]') || output.includes('%')) {
                console.log('📥 yt-dlp:', output.trim());
                if (progressCallback) {
                    const match = output.match(/(\d+\.\d+)%/);
                    if (match) {
                        const percent = parseFloat(match[1]);
                        progressCallback({ 
                            message: `Real-time merging... ${percent}%`, 
                            progress: percent 
                        });
                    }
                }
            }
        });

        // Handle FFmpeg stderr for progress
        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Only log meaningful FFmpeg output, not binary noise
            if (output.includes('time=') || output.includes('frame=')) {
                console.log('🎬 FFmpeg:', output.trim());
            }
        });

        // Handle errors
        ytdlp.on('error', (error) => {
            console.error('❌ yt-dlp error:', error);
            reject(error);
        });

        ffmpegProcess.on('error', (error) => {
            console.error('❌ FFmpeg error:', error);
            reject(error);
        });

        // Handle completion
        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Real-time FFmpeg merge completed successfully!');
                resolve();
            } else {
                console.error(`❌ FFmpeg exited with code ${code}`);
                reject(new Error(`FFmpeg process failed with exit code ${code}`));
            }
        });

        ytdlp.on('close', (code) => {
            if (code !== 0) {
                console.error(`❌ yt-dlp exited with code ${code}`);
                reject(new Error(`yt-dlp process failed with exit code ${code}`));
            }
        });
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
