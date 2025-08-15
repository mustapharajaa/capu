const fs = require('fs');
const path = require('path');
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

            const editors = JSON.parse(fs.readFileSync(this.editorsFile, 'utf8'));
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
     * Get available editors count
     */
    getAvailableEditorsCount() {
        try {
            if (!fs.existsSync(this.editorsFile)) {
                return 0;
            }

            const editors = JSON.parse(fs.readFileSync(this.editorsFile, 'utf8'));
            const availableEditors = editors.filter(editor => editor.status === 'available');
            return availableEditors.length;
        } catch (error) {
            console.error('❌ Error getting available editors count:', error.message);
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
                
                // Determine how many videos to process concurrently
                const concurrentCount = Math.min(urls.length, availableEditorsCount);
                
                if (concurrentCount > 1) {
                    console.log(`🚀 Starting ${concurrentCount} concurrent automations with 20-second delays...`);
                    
                    // Start concurrent processing with 20-second delays
                    const promises = [];
                    for (let i = 0; i < concurrentCount; i++) {
                        const url = urls[i];
                        
                        // Create a promise that starts after the appropriate delay
                        const delayedPromise = new Promise(async (resolve) => {
                            // Wait for the delay (3 minutes * index)
                            const delay = i * 180000; // 3 minutes (180 seconds) between starts
                            if (delay > 0) {
                                console.log(`⏳ Waiting ${delay/1000} seconds (${delay/60000} minutes) before starting automation ${i+1}...`);
                                await new Promise(r => setTimeout(r, delay));
                            }
                            
                            console.log(`🚀 Starting concurrent automation ${i+1}/${concurrentCount} for: ${url}`);
                            
                            try {
                                const success = await this.processSingleVideo(url);
                                resolve({ url, success, index: i+1 });
                            } catch (error) {
                                console.error(`❌ Concurrent automation ${i+1} failed:`, error.message);
                                resolve({ url, success: false, index: i+1 });
                            }
                        });
                        
                        promises.push(delayedPromise);
                    }
                    
                    // Wait for all concurrent automations to complete
                    console.log(`⏳ Waiting for ${concurrentCount} concurrent automations to complete...`);
                    const results = await Promise.all(promises);
                    
                    // Log results
                    let successCount = 0;
                    results.forEach(result => {
                        if (result.success) {
                            successCount++;
                            console.log(`✅ Concurrent automation ${result.index} completed successfully`);
                        } else {
                            console.log(`❌ Concurrent automation ${result.index} failed`);
                        }
                    });
                    
                    console.log(`🎉 Concurrent batch completed: ${successCount}/${concurrentCount} successful`);
                    
                } else {
                    // Single video processing (original logic)
                    const currentUrl = urls[0];
                    const success = await this.processSingleVideo(currentUrl);
                    
                    if (success) {
                        console.log('✅ Video processed successfully, continuing to next...');
                    } else {
                        console.log('❌ Video processing failed, continuing to next...');
                    }
                }

                // Small delay before checking queue again
                console.log('⏳ Waiting 10 seconds before checking queue again...');
                await new Promise(resolve => setTimeout(resolve, 10000));
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
