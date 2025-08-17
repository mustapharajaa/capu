const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { downloadYouTubeVideo } = require('./youtube-downloader-new');
const { runSimpleUpload } = require('./timeline_test');

/**
 * Batch processor for YouTube URLs from "new videos" file
 * Reads URLs from file, downloads each video, and runs full automation
 */
class BatchProcessor {
    constructor() {
        this.queueFile = path.join(__dirname, 'new videos');
        this.processedFile = path.join(__dirname, 'processed videos');
        this.editorsFile = path.join(__dirname, 'editors.json');
        this.isProcessing = false;
        this.currentVideo = null;
        this.recentlyStarted = 0; // Track automations started but not yet marked as running
        this.lastStartTime = 0; // Track when we last started automations
        this.lastAutomationStart = 0; // Track when we last started any automation (for 3-minute spacing)
        
        // Clean up old temp files on startup
        this.cleanupOldTempFiles();
        
        // Set up periodic cleanup every 2 days (48 hours)
        this.setupPeriodicCleanup();
    }

    /**
     * Set up periodic cleanup every 2 days (48 hours)
     */
    setupPeriodicCleanup() {
        const twoDaysInMs = 2 * 24 * 60 * 60 * 1000; // 48 hours in milliseconds
        
        setInterval(() => {
            console.log('🕐 Running periodic temp file cleanup (every 2 days)...');
            this.cleanupOldTempFiles();
        }, twoDaysInMs);
        
        console.log('⏰ Periodic temp file cleanup scheduled every 2 days');
    }

    /**
     * Clean up temp files older than 1 day on startup
     */
    cleanupOldTempFiles() {
        try {
            const tempDir = path.join(__dirname, 'temp');
            
            if (!fs.existsSync(tempDir)) {
                console.log('📁 Temp directory does not exist - skipping cleanup');
                return;
            }
            
            const files = fs.readdirSync(tempDir);
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000); // 24 hours in milliseconds
            let cleanedCount = 0;
            
            files.forEach(file => {
                if (file.startsWith('processing_') && file.endsWith('.tmp')) {
                    const filePath = path.join(tempDir, file);
                    try {
                        // Read the actual timestamp from inside the file
                        const fileContent = fs.readFileSync(filePath, 'utf8');
                        const lines = fileContent.split('\n');
                        const startedLine = lines.find(line => line.startsWith('Started:'));
                        
                        if (startedLine) {
                            const timestampStr = startedLine.replace('Started: ', '').trim();
                            const fileTimestamp = new Date(timestampStr).getTime();
                            const fileAge = Date.now() - fileTimestamp;
                            const fileAgeHours = Math.round(fileAge / (1000 * 60 * 60));
                            
                            console.log(`🔍 Checking temp file: ${file} (age: ${fileAgeHours} hours, started: ${timestampStr})`);
                            
                            if (fileTimestamp < oneDayAgo) {
                                fs.unlinkSync(filePath);
                                cleanedCount++;
                                console.log(`🗑️ Cleaned up old temp file: ${file} (was ${fileAgeHours} hours old)`);
                            } else {
                                console.log(`⏳ Keeping temp file: ${file} (only ${fileAgeHours} hours old, need 24+)`);
                            }
                        } else {
                            // Fallback to file system timestamp if we can't read the content timestamp
                            const stats = fs.statSync(filePath);
                            const fileAge = Date.now() - stats.mtime.getTime();
                            const fileAgeHours = Math.round(fileAge / (1000 * 60 * 60));
                            
                            console.log(`🔍 Checking temp file: ${file} (age: ${fileAgeHours} hours - using file system time)`);
                            
                            if (stats.mtime.getTime() < oneDayAgo) {
                                fs.unlinkSync(filePath);
                                cleanedCount++;
                                console.log(`🗑️ Cleaned up old temp file: ${file} (was ${fileAgeHours} hours old)`);
                            } else {
                                console.log(`⏳ Keeping temp file: ${file} (only ${fileAgeHours} hours old, need 24+)`);
                            }
                        }
                    } catch (error) {
                        console.error(`⚠️ Error checking temp file ${file}:`, error.message);
                    }
                }
            });
            
            if (cleanedCount > 0) {
                console.log(`🧹 Cleaned up ${cleanedCount} old temp files (older than 1 day)`);
            } else {
                console.log('✅ No old temp files to clean up');
            }
            
        } catch (error) {
            console.error('❌ Error during temp file cleanup:', error.message);
        }
    }

    /**
     * Read URLs from the queue file
     */
    readQueueFile() {
        try {
            if (!fs.existsSync(this.queueFile)) {
                console.log('📄 No "new videos" file found - creating empty file');
                fs.writeFileSync(this.queueFile, '');
                return [];
            }

            const content = fs.readFileSync(this.queueFile, 'utf8');
            const urls = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && line.startsWith('http'))
                .map(line => line.replace(/\.$/, '')); // Remove trailing dots

            return urls;
        } catch (error) {
            console.error('❌ Error reading queue file:', error.message);
            return [];
        }
    }

    /**
     * Check if any editors are available
     */
    checkEditorAvailability() {
        try {
            if (!fs.existsSync(this.editorsFile)) {
                console.log('⚠️ No editors.json file found');
                return false;
            }

            const editorsData = JSON.parse(fs.readFileSync(this.editorsFile, 'utf8'));
            const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
            const availableEditors = editors.filter(editor => editor.status === 'available');
            
            console.log(`📊 Editor availability: ${availableEditors.length}/${editors.length} available`);
            return availableEditors.length > 0;
        } catch (error) {
            console.error('❌ Error checking editor availability:', error.message);
            return false;
        }
    }

    /**
     * Remove processed URL from queue file
     */
    removeFromQueue(processedUrl) {
        try {
            const urls = this.readQueueFile();
            const remainingUrls = urls.filter(url => url !== processedUrl);
            
            fs.writeFileSync(this.queueFile, remainingUrls.join('\n') + (remainingUrls.length > 0 ? '\n' : ''));
            console.log(`🗑️ Removed processed URL from queue: ${processedUrl}`);
            
            // Add to processed file for history
            const processedContent = fs.existsSync(this.processedFile) ? fs.readFileSync(this.processedFile, 'utf8') : '';
            const timestamp = new Date().toISOString();
            fs.appendFileSync(this.processedFile, `${timestamp} - ${processedUrl}\n`);
            
        } catch (error) {
            console.error('❌ Error removing URL from queue:', error.message);
        }
    }

    /**
     * Process a single video URL
     */
    async processSingleVideo(url) {
        console.log(`\n🚀 Starting batch processing for: ${url}`);
        this.currentVideo = url;

        try {
            // Step 1: Download the video
            console.log('📥 Step 1: Downloading YouTube video...');
            const downloadedPath = await downloadYouTubeVideo(url, (progress) => {
                if (progress.message) {
                    console.log(`📥 Download Progress: ${progress.message}`);
                }
            });

            console.log(`✅ Download completed: ${downloadedPath}`);

            // Step 2: Run CapCut automation
            console.log('🤖 Step 2: Starting CapCut automation...');
            await runSimpleUpload(downloadedPath, (message) => {
                console.log(`🤖 Automation Progress: ${message}`);
            }, url);

            console.log('✅ Automation completed successfully!');
            
            // Step 3: Remove from queue
            this.removeFromQueue(url);
            
            console.log(`🎉 Batch processing completed for: ${url}\n`);
            return true;

        } catch (error) {
            console.error(`❌ Batch processing failed for ${url}:`, error.message);
            
            // Still remove from queue to prevent infinite retries
            this.removeFromQueue(url);
            
            return false;
        } finally {
            this.currentVideo = null;
        }
    }

    /**
     * Get available editors count (editors that are available and not running)
     */
    getAvailableEditorsCount() {
        try {
            if (!fs.existsSync(this.editorsFile)) {
                return 0;
            }

            const editorsData = JSON.parse(fs.readFileSync(this.editorsFile, 'utf8'));
            const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
            const availableEditors = editors.filter(editor => 
                editor.status === 'available' && editor.result !== 'running'
            );
            
            console.log(`🔍 DEBUG: Available editors (status='available' AND result!='running'): ${availableEditors.length}`);
            return availableEditors.length;
        } catch (error) {
            console.error('❌ Error getting available editors count:', error.message);
            return 0;
        }
    }

    /**
     * Get running automations count (editors currently running)
     */
    getRunningAutomationsCount() {
        try {
            if (!fs.existsSync(this.editorsFile)) {
                console.log('🔍 DEBUG: editors.json file does not exist');
                return 0;
            }

            const editorsData = JSON.parse(fs.readFileSync(this.editorsFile, 'utf8'));
            const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
            
            const runningEditors = editors.filter(editor => editor.result === 'running');
            
            // Debug: Show all editor statuses
            console.log('🔍 DEBUG: Editor statuses:');
            editors.forEach((editor, index) => {
                console.log(`  Editor ${index + 1}: status="${editor.status}", result="${editor.result}"`);
            });
            
            console.log(`🔍 DEBUG: Found ${runningEditors.length} editors with result="running"`);
            return runningEditors.length;
        } catch (error) {
            console.error('❌ Error getting running automations count:', error.message);
            return 0;
        }
    }

    /**
     * Process all videos in the queue with concurrent processing
     */
    async processQueue() {
        if (this.isProcessing) {
            console.log('⚠️ Batch processor is already running');
            return;
        }

        this.isProcessing = true;
        console.log('🚀 Starting batch processor...');

        try {
            while (true) {
                // Check for running automations first (hard limit of 3)
                const runningCount = this.getRunningAutomationsCount();
                console.log(`🔍 DEBUG: Currently ${runningCount} automations running`);
                
                // Check if we recently started automations (within last 2 minutes) and they haven't been marked as running yet
                const timeSinceLastStart = Date.now() - this.lastStartTime;
                const effectiveRunningCount = runningCount + this.recentlyStarted;
                
                if (timeSinceLastStart < 120000 && this.recentlyStarted > 0) { // 2 minutes
                    console.log(`🔍 DEBUG: Recently started ${this.recentlyStarted} automations ${Math.round(timeSinceLastStart/1000)}s ago, effective count: ${effectiveRunningCount}`);
                }
                
                // Reset recently started count if enough time has passed
                if (timeSinceLastStart > 120000) {
                    this.recentlyStarted = 0;
                }
                
                if (effectiveRunningCount >= 3) {
                    if (runningCount >= 3) {
                        console.log(`⏳ Maximum concurrent limit reached (${runningCount}/3 running) - waiting 3 minutes before retry...`);
                    } else {
                        console.log(`⏳ Recently started automations not yet marked as running (${runningCount} running + ${this.recentlyStarted} starting = ${effectiveRunningCount}) - waiting 3 minutes...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 180000)); // Wait 3 minutes (180 seconds)
                    continue;
                }

                // Check for available editors
                const availableEditorsCount = this.getAvailableEditorsCount();
                if (availableEditorsCount === 0) {
                    console.log('⏳ No editors available - waiting 3 minutes before retry...');
                    await new Promise(resolve => setTimeout(resolve, 180000)); // Wait 3 minutes (180 seconds)
                    continue;
                }

                // Read current queue
                const urls = this.readQueueFile();
                
                if (urls.length === 0) {
                    console.log('📄 Queue is empty - waiting for new videos...');
                    // Don't break - keep monitoring for new videos
                    await new Promise(resolve => setTimeout(resolve, 180000)); // Wait 3 minutes (180 seconds)
                    continue;
                }

                console.log(`📋 Found ${urls.length} URLs in queue, ${availableEditorsCount} editors available`);
                
                // Check if we need to wait 3 minutes since last automation start
                const timeSinceLastAutomation = Date.now() - this.lastAutomationStart;
                const minDelayBetweenAutomations = 180000; // 3 minutes in milliseconds
                
                if (this.lastAutomationStart > 0 && timeSinceLastAutomation < minDelayBetweenAutomations) {
                    const remainingWait = Math.ceil((minDelayBetweenAutomations - timeSinceLastAutomation) / 1000);
                    console.log(`⏳ Waiting ${remainingWait} seconds before starting next automation (3-minute spacing)...`);
                    await new Promise(resolve => setTimeout(resolve, minDelayBetweenAutomations - timeSinceLastAutomation));
                }
                
                // ATOMIC URL ASSIGNMENT: Find an unclaimed URL by checking temp files
                let currentUrl = null;
                let urlIndex = -1;
                
                for (let i = 0; i < urls.length; i++) {
                    const url = urls[i];
                    const urlHash = require('crypto').createHash('md5').update(url).digest('hex');
                    const tempDir = path.join(__dirname, 'temp');
                    
                    // Create temp directory if it doesn't exist
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    
                    const tempFile = path.join(tempDir, `processing_${urlHash}.tmp`);
                    
                    // Check if this URL is already being processed
                    if (!fs.existsSync(tempFile)) {
                        // Claim this URL by creating temp file
                        try {
                            fs.writeFileSync(tempFile, `Processing: ${url}\nStarted: ${new Date().toISOString()}\nPID: ${process.pid}`);
                            currentUrl = url;
                            urlIndex = i;
                            console.log(`🔒 Claimed URL for processing: ${url}`);
                            break;
                        } catch (error) {
                            // Another process might have claimed it, try next URL
                            continue;
                        }
                    }
                }
                
                if (!currentUrl) {
                    console.log('⏳ All URLs are currently being processed by other editors - waiting...');
                    await new Promise(resolve => setTimeout(resolve, 20000)); // Wait 20 seconds
                    continue;
                }
                
                console.log(`🚀 Starting automation for: ${currentUrl}`);
                
                // Track that we just started an automation
                this.recentlyStarted = 1;
                this.lastStartTime = Date.now();
                this.lastAutomationStart = Date.now(); // Track for 3-minute spacing
                
                // Start single automation without waiting for it to complete
                const automationPromise = this.processSingleVideo(currentUrl);
                
                // Handle completion asynchronously (don't block queue monitoring)
                automationPromise.then(success => {
                    // Clean up temp file
                    const urlHash = require('crypto').createHash('md5').update(currentUrl).digest('hex');
                    const tempDir = path.join(__dirname, 'temp');
                    const tempFile = path.join(tempDir, `processing_${urlHash}.tmp`);
                    try {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                            console.log(`🗑️ Cleaned up temp file for: ${currentUrl}`);
                        }
                    } catch (error) {
                        console.error('⚠️ Error cleaning up temp file:', error.message);
                    }
                    
                    if (success) {
                        console.log('✅ Video processed successfully');
                        // Remove from queue only on success
                        this.removeFromQueue(currentUrl);
                    } else {
                        console.log('❌ Video processing failed');
                        // On failure, don't remove from queue so it can be retried later
                    }
                    
                    // Reset recently started count when automation completes
                    this.recentlyStarted = Math.max(0, this.recentlyStarted - 1);
                    console.log(`🔍 DEBUG: Automation completed, recently started count reset to ${this.recentlyStarted}`);
                }).catch(error => {
                    console.error('❌ Automation error:', error.message);
                    
                    // Clean up temp file on error too
                    const urlHash = require('crypto').createHash('md5').update(currentUrl).digest('hex');
                    const tempDir = path.join(__dirname, 'temp');
                    const tempFile = path.join(tempDir, `processing_${urlHash}.tmp`);
                    try {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                            console.log(`🗑️ Cleaned up temp file after error for: ${currentUrl}`);
                        }
                    } catch (cleanupError) {
                        console.error('⚠️ Error cleaning up temp file:', cleanupError.message);
                    }
                    
                    // Reset on error too
                    this.recentlyStarted = Math.max(0, this.recentlyStarted - 1);
                });

                // Small delay before checking queue again
                console.log('⏳ Waiting 20 seconds before checking queue again...');
                await new Promise(resolve => setTimeout(resolve, 20000));
            }

        } catch (error) {
            console.error('❌ Batch processor error:', error.message);
            console.log('🔄 Restarting batch processor in 60 seconds...');
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute before restart
            // Don't set isProcessing to false - keep it running
            return this.processQueue(); // Restart the processor
        } finally {
            // This should never be reached in normal operation
            console.log('⚠️ Batch processor unexpectedly stopped - this should not happen');
            this.isProcessing = false;
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            currentVideo: this.currentVideo,
            queueLength: this.readQueueFile().length,
            editorsAvailable: this.checkEditorAvailability()
        };
    }
}

module.exports = BatchProcessor;
