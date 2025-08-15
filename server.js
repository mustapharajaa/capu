const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

        const editors = JSON.parse(fs.readFileSync(editorsFile, 'utf8'));
        const runningAutomations = editors.filter(editor => editor.status === 'in-use');
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
        
        // Check concurrent automation limit (maximum 3)
        const maxConcurrent = 3;
        const runningCount = getRunningAutomationsCount();
        
        if (runningCount >= maxConcurrent) {
            console.log(`🔒 Automation limit reached: ${runningCount}/${maxConcurrent} automations running`);
            console.log('❌ Local upload blocked - too many concurrent automations');
            
            // Delete the uploaded file since automation cannot proceed
            if (fs.existsSync(absoluteFilePath)) {
                fs.unlinkSync(absoluteFilePath);
                console.log(`🗑️ Deleted uploaded file: ${path.basename(absoluteFilePath)}`);
            }
            
            return res.status(429).json({
                success: false,
                message: `Too many concurrent automations (${runningCount}/${maxConcurrent}). Please wait for an automation to complete before uploading.`,
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
        res.json({ videos: [] }); // Return empty array if file doesn't exist
    }
});

// Server-Sent Events for progress updates
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
    const data = `data: ${JSON.stringify({ message, timestamp: new Date().toISOString() })}\n\n`;
    progressClients.forEach(client => {
        try {
            client.write(data);
        } catch (err) {
            progressClients.delete(client);
        }
    });
}

// Make broadcastProgress available globally
global.broadcastProgress = broadcastProgress;

// Simple upload endpoint for CapCut automation
app.post('/upload', async (req, res) => {
    try {
        const { videoPath } = req.body;
        if (!videoPath || !fs.existsSync(videoPath)) {
            return res.status(400).json({ success: false, message: 'Valid video path is required' });
        }

        broadcastProgress('🚀 Starting CapCut upload automation...');
        
        const result = await runSimpleUpload(videoPath, (message) => {
            broadcastProgress(message);
        }, 'Direct Upload');
        
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
            info: videoInfo 
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
        if (fs.existsSync(editorsPath)) {
            const editors = JSON.parse(fs.readFileSync(editorsPath, 'utf-8'));
            const availableEditors = editors.filter(editor => editor.status === 'available');
            
            if (availableEditors.length === 0) {
                console.log('❌ All editors are currently in-use - YouTube download blocked');
                broadcastProgress('❌ All editors busy - download blocked');
                return res.status(409).json({ 
                    success: false, 
                    message: 'All editors are currently in-use. Please wait for an editor to become available before downloading videos.' 
                });
            }
        }

        broadcastProgress('🚀 Starting YouTube video download...');
        
        // Download the video with progress updates
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

// --- Server Start ---
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log('Open your browser and navigate to the URL to start.');
});

// --- Graceful Shutdown ---
async function gracefulShutdown() {
    console.log('\nShutting down gracefully...');
    server.close(() => {
        console.log('Server has been shut down.');
        process.exit(0);
    });
}

// Listen for SIGINT (Ctrl+C)
process.on('SIGINT', gracefulShutdown);

// Listen for other termination signals
process.on('SIGTERM', gracefulShutdown);
