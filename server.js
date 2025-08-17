const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { downloadYouTubeVideo, getVideoInfo } = require('./youtube-downloader-new');
const BatchProcessor = require('./batch-processor');
const { runSimpleUpload } = require('./timeline_test');
require('dotenv').config();

// Initialize batch processor
const batchProcessor = new BatchProcessor();

// Function to count currently running automations
function getRunningAutomationsCount() {
    try {
        const editorsFile = path.join(__dirname, 'editors.json');
        if (!fs.existsSync(editorsFile)) {
            return 0;
        }

        const editorsData = JSON.parse(fs.readFileSync(editorsFile, 'utf8'));
        const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
        const runningAutomations = editors.filter(editor => editor.result === 'running');
        return runningAutomations.length;
    } catch (error) {
        console.error('❌ Error counting running automations:', error.message);
        return 0;
    }
}

// Auto-start batch processor on server startup (if enabled in .env)
setTimeout(() => {
    const batchProcessorEnabled = process.env['batch-processor'] === 'true';
    
    if (!batchProcessorEnabled) {
        console.log('📴 Batch processor disabled in .env - skipping auto-start');
        return;
    }
    
    console.log('🔍 Batch processor enabled - checking for videos in queue...');
    const urls = batchProcessor.readQueueFile();
    if (urls.length > 0) {
        console.log(`📋 Found ${urls.length} videos in queue - starting batch processor automatically`);
        batchProcessor.processQueue().catch(error => {
            console.error('❌ Auto-start batch processor error:', error);
        });
    } else {
        console.log('📄 No videos in queue - batch processor on standby');
    }
}, 5000); // Wait 5 seconds after server start

// Watch "new videos" file for changes and auto-start batch processor (if enabled)
const newVideosFile = path.join(__dirname, 'new videos');
const batchProcessorEnabled = process.env['batch-processor'] === 'true';

if (batchProcessorEnabled && fs.existsSync(newVideosFile)) {
    fs.watchFile(newVideosFile, { interval: 5000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
            console.log('📁 "new videos" file updated - checking for new URLs...');
            setTimeout(() => {
                const urls = batchProcessor.readQueueFile();
                if (urls.length > 0 && !batchProcessor.isProcessing) {
                    console.log(`📋 Found ${urls.length} new videos - starting batch processor`);
                    batchProcessor.processQueue().catch(error => {
                        console.error('❌ File watcher batch processor error:', error);
                    });
                }
            }, 2000); // Wait 2 seconds for file write to complete
        }
    });
    console.log('👁️ Watching "new videos" file for changes...');
} else if (!batchProcessorEnabled) {
    console.log('📴 File watcher disabled - batch processor not enabled in .env');
}

// Configure multer for local file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // Files will be saved in the 'uploads' directory
    },
    filename: function (req, file, cb) {
        // Create a unique filename to avoid overwriting
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

const app = express();
const port = 3000;

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- API Routes ---

// Local video upload route
app.post('/upload', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const absoluteFilePath = path.resolve(req.file.path);
    console.log(`📁 File successfully uploaded to: ${absoluteFilePath}`);

    try {
        console.log('📼 Starting CapCut automation for local upload...');
        
        // Check concurrent automation limit (maximum 3 with shared browser)
        const maxConcurrent = 3;
        const runningCount = getRunningAutomationsCount();
        
        if (runningCount >= maxConcurrent) {
            console.log(`❌ Concurrent automation limit reached (${runningCount}/${maxConcurrent})`);
            broadcastProgress(`❌ Limit reached - please wait`);
            return res.status(429).json({
                success: false,
                message: `Maximum concurrent automations (${maxConcurrent}) reached. Please try again later.`,
                runningCount: runningCount,
                maxConcurrent: maxConcurrent
            });
        }
        
        console.log(`🚀 Starting automation (${runningCount + 1}/${maxConcurrent} slots used)`);
        
        // Start CapCut automation with the uploaded file
        await runSimpleUpload(absoluteFilePath, (message) => {
            console.log('📤 Upload Progress:', message);
            broadcastProgress(message);
        }, 'Local File Upload');
        
        console.log('🎉 CapCut automation completed successfully for local upload!');
        
        res.json({
            success: true,
            message: 'File uploaded and CapCut automation completed successfully!',
            filePath: absoluteFilePath
        });
    } catch (error) {
        console.error('❌ Local upload automation failed:', error.message);
        broadcastProgress(`❌ Upload failed: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Upload automation failed: ${error.message}`
        });
    }
});

// Serve videos.json file
app.get('/videos.json', (req, res) => {
    const videosJsonPath = path.join(__dirname, 'videos.json');
    if (fs.existsSync(videosJsonPath)) {
        res.sendFile(videosJsonPath);
    } else {
        res.status(404).json({ success: false, message: 'videos.json not found' });
    }
});

// Progress update stream
const progressClients = new Set();
app.get('/progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    progressClients.add(res);
    
    req.on('close', () => {
        progressClients.delete(res);
    });
});

// Function to broadcast progress to all connected clients
function broadcastProgress(message) {
    for (const client of progressClients) {
        client.write(`data: ${JSON.stringify({ message })}\n\n`);
    }
}

// Make broadcastProgress available globally
global.broadcastProgress = broadcastProgress;

// Simple upload endpoint for CapCut automation
app.post('/simple-upload', async (req, res) => {
    try {
        const { videoPath } = req.body;
        if (!videoPath) {
            return res.status(400).json({ success: false, message: 'Video path is required.' });
        }

        const result = await runSimpleUpload(videoPath, (progress) => {
            broadcastProgress(progress);
        });

        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('Upload automation error:', error);
        broadcastProgress(`❌ Upload failed: ${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve the videos page
app.get('/videos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'videos.html'));
});

// --- Page for updating cookies ---
app.get('/go', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'go.html'));
});

// --- API for getting and setting cookies ---
app.get('/api/cookies', (req, res) => {
    const cookiesPath = path.join(__dirname, 'youtube-cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        // Set content type to plain text to avoid browser rendering issues
        res.type('text/plain');
        res.sendFile(cookiesPath);
    } else {
        // Send empty string if file doesn't exist, so the textarea is just empty
        res.status(200).send('');
    }
});

app.post('/api/cookies', (req, res) => {
    const { cookies } = req.body;
    if (typeof cookies !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid cookie data.' });
    }

    const cookiesPath = path.join(__dirname, 'youtube-cookies.txt');
    fs.writeFile(cookiesPath, cookies, (err) => {
        if (err) {
            console.error('Error saving cookies:', err);
            return res.status(500).json({ success: false, message: 'Failed to save cookie file.' });
        }
        console.log('🍪 YouTube cookies file updated successfully.');
        res.json({ success: true, message: 'Cookies saved successfully!' });
    });
});

app.post('/api/editors', (req, res) => {
    const { editors } = req.body;
    if (!editors) {
        return res.status(400).json({ success: false, message: 'Invalid editors data.' });
    }

    const editorsPath = path.join(__dirname, 'editors.json');
    // Pretty print the JSON with an indent of 2 spaces
    const editorsString = JSON.stringify(editors, null, 2);

    fs.writeFile(editorsPath, editorsString, (err) => {
        if (err) {
            console.error('Error saving editors.json:', err);
            return res.status(500).json({ success: false, message: 'Failed to save editors.json.' });
        }
        console.log('📝 editors.json file updated successfully via API.');
        res.json({ success: true, message: 'Editors file saved successfully!' });
    });
});

app.get('/api/editors', (req, res) => {
    const editorsPath = path.join(__dirname, 'editors.json');
    if (fs.existsSync(editorsPath)) {
        res.sendFile(editorsPath);
    } else {
        res.status(404).json({ success: false, message: 'editors.json not found.' });
    }
});

// --- API for getting and setting new videos queue ---
app.get('/api/new-videos', (req, res) => {
    const newVideosPath = path.join(__dirname, 'new videos');
    if (fs.existsSync(newVideosPath)) {
        res.type('text/plain');
        res.sendFile(newVideosPath);
    } else {
        res.status(200).send(''); // Send empty if it doesn't exist
    }
});

app.post('/api/new-videos', (req, res) => {
    const { videos } = req.body;
    if (typeof videos !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid data for new videos file.' });
    }

    const newVideosPath = path.join(__dirname, 'new videos');
    fs.writeFile(newVideosPath, videos, (err) => {
        if (err) {
            console.error('Error saving new videos file:', err);
            return res.status(500).json({ success: false, message: 'Failed to save new videos file.' });
        }
        console.log('📹 New videos queue file updated successfully via API.');
        res.json({ success: true, message: 'Video queue saved successfully!' });
    });
});

// YouTube download routes
app.post('/youtube/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'YouTube URL is required' });
        }

        broadcastProgress('🔍 Getting video information...');
        const videoInfo = await getVideoInfo(url);
        
        res.json({ 
            success: true, 
            ...videoInfo 
        });
    } catch (error) {
        console.error('Error getting video info:', error);
        broadcastProgress(`❌ Error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

app.post('/youtube/download', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'YouTube URL is required' });
        }

        // Check editor availability BEFORE downloading to prevent waste
        const editorsPath = path.join(__dirname, 'editors.json');
        if (!fs.existsSync(editorsPath)) {
            throw new Error('editors.json not found - cannot check editor availability');
        }
        const editors = JSON.parse(fs.readFileSync(editorsPath, 'utf8'));
        const availableEditor = editors.find(editor => editor.status === 'available');
        if (!availableEditor) {
            console.log('❌ All editors are busy - download blocked');
            broadcastProgress('❌ All editors are busy - download blocked');
            return res.status(429).json({ success: false, message: 'All editors are currently in-use.' });
        }

        broadcastProgress('📥 Download starting...');
        const downloadedPath = await downloadYouTubeVideo(url, (progress) => {
            broadcastProgress(progress);
        });

        // Start automation pipeline after download
        broadcastProgress('📤 Starting CapCut automation pipeline...');
        console.log('🔍 DEBUG: Downloaded file path:', downloadedPath);
        console.log('🔍 DEBUG: File exists:', fs.existsSync(downloadedPath));
        
        // Editor availability already checked above - proceed with automation
        
        // Import and run the automation
        console.log('🚀 DEBUG: About to call runSimpleUpload...');
        const { runSimpleUpload } = require('./timeline_test');
        await runSimpleUpload(downloadedPath, (message) => {
            console.log('📤 Upload Progress:', message);
        }, url);
        
        res.json({ 
            success: true, 
            message: 'Video downloaded and automation started',
            filePath: downloadedPath
        });
    } catch (error) {
        console.error('Error downloading video:', error);
        broadcastProgress(`❌ Download failed: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Status check now checks the filesystem for the puppeteer_data directory.
app.get('/status', (req, res) => {
    const puppeteerDataPath = path.join(__dirname, 'puppeteer_data');
    const isLoggedIn = fs.existsSync(puppeteerDataPath);
    console.log(`Checking for login status via filesystem. Path: '${puppeteerDataPath}'. Found: ${isLoggedIn}`);
    res.json({ loggedIn: isLoggedIn });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    // Login functionality removed - automation now handles login via persistent user data
    res.json({ success: true, message: 'Login handled via persistent browser session.' });
});

// Batch processor routes
app.post('/batch/start', async (req, res) => {
    try {
        console.log('🚀 Starting batch processor...');
        
        // Start batch processing (non-blocking)
        batchProcessor.processQueue().catch(error => {
            console.error('❌ Batch processor error:', error);
        });
        
        res.json({ 
            success: true, 
            message: 'Batch processor started - processing videos from "new videos" file' 
        });
    } catch (error) {
        console.error('❌ Failed to start batch processor:', error);
        res.status(500).json({ 
            success: false, 
            message: `Failed to start batch processor: ${error.message}` 
        });
    }
});

app.get('/batch/status', (req, res) => {
    try {
        const status = batchProcessor.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        console.error('❌ Failed to get batch processor status:', error);
        res.status(500).json({ 
            success: false, 
            message: `Failed to get status: ${error.message}` 
        });
    }
});

app.post('/create-video', async (req, res) => {
    const { videoPath } = req.body;
    if (!videoPath) {
        return res.status(400).json({ success: false, message: 'Video path is required.' });
    }
    // Video creation now handled via upload route with automation pipeline
    res.json({ success: true, message: 'Use /upload endpoint for video processing.' });
});

// Smart cache rotation: keep CapCut data, remove oldest cache
async function rotateOldCache(puppeteerDataPath) {
    try {
        const { execSync } = require('child_process');
        
        // Keep only essential login data, remove most cache for minimal storage
        const dirsToKeepEssential = [
            'Default/Local Storage',
            'Default/Session Storage',
            'Default/Cookies',
            'Default/Preferences',
            'Default/Web Data',
            'Safe Browsing'
        ];
        
        const dirsToCleanMost = [
            'Default/IndexedDB',      // 304MB - keep only 10%
            'Default/Service Worker', // 54MB - keep only 10%
            'Default/Cache',          // 29MB - keep only 10%
            'Default/GPUCache',       // 4MB - keep only 20%
            'Default/DawnCache',
            'Default/Code Cache',
            'ShaderCache',
            'GrShaderCache',
            'GraphiteDawnCache'
        ];
        
        // Clean most cache files, keep only essential login data + minimal performance cache
        dirsToCleanMost.forEach(cacheDir => {
            const fullCachePath = path.join(puppeteerDataPath, cacheDir);
            if (fs.existsSync(fullCachePath)) {
                try {
                    // Get all files and sort by modification time (newest first)
                    const files = fs.readdirSync(fullCachePath);
                    const fileStats = files.map(file => {
                        const filePath = path.join(fullCachePath, file);
                        const stats = fs.statSync(filePath);
                        return { file, path: filePath, mtime: stats.mtime };
                    }).sort((a, b) => b.mtime - a.mtime); // Newest first
                    
                    // Keep different percentages based on directory importance
                    let keepPercentage = 0.1; // Default: keep 10%
                    if (cacheDir.includes('GPUCache')) keepPercentage = 0.2; // Keep 20% for graphics
                    if (cacheDir.includes('IndexedDB')) keepPercentage = 0.05; // Keep only 5% of largest cache
                    
                    const filesToKeep = Math.floor(fileStats.length * keepPercentage);
                    
                    // Remove all but the newest files
                    for (let i = filesToKeep; i < fileStats.length; i++) {
                        try {
                            if (fs.statSync(fileStats[i].path).isDirectory()) {
                                if (process.platform === 'win32') {
                                    execSync(`rmdir /s /q "${fileStats[i].path}"`, { stdio: 'ignore' });
                                } else {
                                    execSync(`rm -rf "${fileStats[i].path}"`, { stdio: 'ignore' });
                                }
                            } else {
                                fs.unlinkSync(fileStats[i].path);
                            }
                        } catch (e) {
                            // Silent fail for individual file cleanup
                        }
                    }
                } catch (e) {
                    // Silent fail for directory processing
                }
            }
        });
        
        // Also clean some non-essential directories completely
        const nonEssentialDirs = [
            'Crashpad',
            'segmentation_platform'
        ];
        
        nonEssentialDirs.forEach(dir => {
            const fullPath = path.join(puppeteerDataPath, dir);
            if (fs.existsSync(fullPath)) {
                try {
                    if (process.platform === 'win32') {
                        execSync(`rmdir /s /q "${fullPath}"`, { stdio: 'ignore' });
                    } else {
                        execSync(`rm -rf "${fullPath}"`, { stdio: 'ignore' });
                    }
                } catch (e) {
                    // Silent fail
                }
            }
        });
        
        console.log('🔄 Rotated old cache files (kept newest CapCut data & cookies)');
    } catch (error) {
        console.log('⚠️ Could not rotate cache:', error.message);
    }
}

// --- Server Start ---
const server = app.listen(port, '0.0.0.0', async () => {
    console.log(`🌐 Server is running on http://localhost:${port}`);
    console.log(`🌍 Web app accessible at: http://0.0.0.0:${port}`);
    console.log(`📱 Management page: http://localhost:${port}/go`);
    console.log('🔗 Server is now accessible from any IP address!');
    console.log('Open your browser and navigate to the URL to start.');
    
    // Clean all video files and temp files on restart
    try {
        // Clean uploads folder
        const uploadFiles = fs.readdirSync('uploads');
        uploadFiles.forEach(file => {
            if (file.endsWith('.mp4') || file.endsWith('.info.json')) {
                fs.unlinkSync(`uploads/${file}`);
            }
        });
        // Clean temp folder
        const tempFiles = fs.readdirSync('temp');
        tempFiles.forEach(file => {
            if (file.endsWith('.tmp')) {
                fs.unlinkSync(`temp/${file}`);
            }
        });
        
        // Smart cache rotation: keep CapCut cache/cookies, remove oldest cache
        const puppeteerDataPath = path.join(__dirname, 'puppeteer_data');
        if (fs.existsSync(puppeteerDataPath)) {
            try {
                await rotateOldCache(puppeteerDataPath);
                console.log('🔄 Smart cache rotation: kept CapCut data, removed oldest cache');
            } catch (cleanupError) {
                console.log('⚠️ Could not rotate cache:', cleanupError.message);
            }
        }
    } catch(e) {}
    
    // Set up periodic cleanup for puppeteer_data to prevent 1GB+ growth
    setInterval(async () => {
        try {
            const puppeteerDataPath = path.join(__dirname, 'puppeteer_data');
            if (fs.existsSync(puppeteerDataPath)) {
                const stats = fs.statSync(puppeteerDataPath);
                const sizeInMB = getDirectorySize(puppeteerDataPath) / (1024 * 1024);
                
                // Smart cache rotation if directory is larger than 200MB
                if (sizeInMB > 200) {
                    console.log(`🔄 Puppeteer data directory is ${sizeInMB.toFixed(0)}MB, rotating old cache...`);
                    try {
                        await rotateOldCache(puppeteerDataPath);
                        console.log('🔄 Smart cache rotation completed (kept CapCut data, newest cookies)');
                    } catch (cleanupError) {
                        console.log('⚠️ Could not rotate cache:', cleanupError.message);
                    }
                }
            }
        } catch (error) {
            // Silent fail for periodic cleanup
        }
    }, 10 * 60 * 1000); // Check every 10 minutes
    
    console.log('⏰ Periodic puppeteer_data cleanup scheduled every 10 minutes (cleans if >200MB)');
});

// Helper function to calculate directory size
function getDirectorySize(dirPath) {
    let totalSize = 0;
    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                totalSize += getDirectorySize(filePath);
            } else {
                totalSize += stats.size;
            }
        }
    } catch (error) {
        // Silent fail for size calculation
    }
    return totalSize;
}

// --- Graceful Shutdown ---
async function cleanupBrowser() {
    console.log('🧹 Cleaning up browser instances...');
    return new Promise((resolve) => {
        // Command to find the process using port 9222 on Windows
        const command = 'netstat -aon | findstr :9222';
        exec(command, (err, stdout, stderr) => {
            if (err || !stdout) {
                // This is expected if no process is listening on the port
                console.log('✅ No browser process found on port 9222.');
                return resolve();
            }

            const lines = stdout.trim().split('\n');
            const pids = new Set();

            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0' && /LISTENING|ESTABLISHED/.test(line)) {
                    pids.add(pid);
                }
            });

            if (pids.size === 0) {
                console.log('✅ No active browser process found to kill.');
                return resolve();
            }

            let killedCount = 0;
            pids.forEach(pid => {
                console.log(`🔪 Terminating browser process with PID: ${pid}`);
                // Forcefully kill the process by PID
                exec(`taskkill /PID ${pid} /F`, (killErr, killStdout, killStderr) => {
                    if (killErr) {
                        console.error(`❌ Failed to kill process ${pid}:`, killStderr);
                    } else {
                        console.log(`👍 Successfully terminated process ${pid}.`);
                    }
                    killedCount++;
                    if (killedCount === pids.size) {
                        resolve();
                    }
                });
            });
        });
    });
}

async function gracefulShutdown() {
    console.log('\nShutting down gracefully...');
    await cleanupBrowser(); // Ensure browser is closed
    server.close(() => {
        console.log('Server has been shut down.');
        process.exit(0);
    });
}

// Listen for SIGINT (Ctrl+C)
process.on('SIGINT', gracefulShutdown);

// Listen for other termination signals
process.on('SIGTERM', gracefulShutdown);
