const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const GoogleSheetsService = require('./google-sheets-service');

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Initialize Google Sheets service
const googleSheets = new GoogleSheetsService();

// User data directory for persistent browser sessions (like reference app)
const USER_DATA_DIR = path.join(__dirname, 'puppeteer_data');

// Global variables for tab switching
let runningEditorTabs = new Map(); // Map of editorId -> page
let tabSwitchingInterval = null;

// Global browser instance for reuse
let globalBrowser = null;

// Note: CapCut cookies and cache are preserved in puppeteer_data directory
// Smart cache rotation keeps newest cookies automatically

// Tab switching management functions
function startTabSwitching() {
    try {
        const editorsPath = path.join(__dirname, 'editors.json');
        if (!fs.existsSync(editorsPath)) return;
        
        const editorsData = JSON.parse(fs.readFileSync(editorsPath, 'utf8'));
        
        // Check if editors.json has new structure with tabSwitching config
        let tabSwitchingConfig;
        if (editorsData.tabSwitching) {
            tabSwitchingConfig = editorsData.tabSwitching;
        } else {
            // Default config for old structure
            tabSwitchingConfig = { enabled: true, intervalSeconds: 10 };
        }
        
        if (!tabSwitchingConfig.enabled || runningEditorTabs.size < 2) return;
        
        if (tabSwitchingInterval) clearInterval(tabSwitchingInterval);
        
        let currentTabIndex = 0;
        
        tabSwitchingInterval = setInterval(async () => {
            const tabArray = Array.from(runningEditorTabs.values()); // Get fresh tab array each time
            if (tabArray.length > 1) {
                try {
                    // Ensure currentTabIndex is within bounds
                    if (currentTabIndex >= tabArray.length) {
                        currentTabIndex = 0;
                    }
                    await tabArray[currentTabIndex].bringToFront();
                    currentTabIndex = (currentTabIndex + 1) % tabArray.length;
                } catch (error) {
                    // Tab might be closed, ignore error
                    console.log('🔄 Tab switching error (tab may be closed):', error.message);
                }
            }
        }, tabSwitchingConfig.intervalSeconds * 1000);
        
        console.log(`🔄 Tab switching enabled: ${tabSwitchingConfig.intervalSeconds}s interval`);
    } catch (error) {
        console.log('⚠️ Tab switching setup failed:', error.message);
    }
}

function stopTabSwitching() {
    if (tabSwitchingInterval) {
        clearInterval(tabSwitchingInterval);
        tabSwitchingInterval = null;
        console.log('⏹️ Tab switching stopped');
    }
}

function addEditorTab(editorId, page) {
    runningEditorTabs.set(editorId, page);
    if (runningEditorTabs.size >= 2) {
        startTabSwitching();
    }
}

function removeEditorTab(editorId) {
    runningEditorTabs.delete(editorId);
    if (runningEditorTabs.size < 2) {
        stopTabSwitching();
    }
}

/**
 * Simple CapCut automation - Upload video and monitor for success
 */
async function runSimpleUpload(videoPath, progressCallback, originalUrl = '') {
    let browser = null;
    let page = null;
    let editorUrl = null;
    
    try {
        console.log('🚀 Starting CapCut automation...');
        
        // Set editor status to "in-use" when automation starts
        try {
            const editorsPath = path.join(__dirname, 'editors.json');
            if (fs.existsSync(editorsPath)) {
                const editorsData = JSON.parse(fs.readFileSync(editorsPath, 'utf8'));
                
                // Handle both old array structure and new object structure
                const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
                
                // Find an available editor and mark it as in-use
                const availableEditor = editors.find(editor => editor.status === 'available');
                if (availableEditor) {
                    editorUrl = availableEditor.url;
                    // Set editor status to "in-use" and record start time
                    availableEditor.status = 'in-use';
                    availableEditor.lastRun = new Date().toISOString();
                    availableEditor.result = 'running'; // Will be updated to 'complete' or 'error' later
                    fs.writeFileSync(editorsPath, JSON.stringify(editorsData, null, 4));
                    console.log('📝 Editor status set to "in-use"');
                    if (progressCallback) progressCallback('📝 Editor reserved for automation');
                } else {
                    console.log('❌ All editors are currently in-use - automation blocked');
                    if (progressCallback) progressCallback('❌ All editors busy - please wait');
                    throw new Error('All editors are currently in-use. Please wait for an editor to become available before starting new automation.');
                }
            }
        } catch (statusError) {
            // Don't log here - error already logged above, just re-throw to stop automation
            throw statusError;
        }
        
        // Function to connect to existing browser or launch a new one
        async function getBrowserInstance(editorId) {
            // Check if we have a global browser and it's still connected
            if (globalBrowser) {
                try {
                    // Test if browser is still connected by checking if it's connected
                    await globalBrowser.version();
                    console.log('🔄 Reusing existing browser instance');
                    return globalBrowser;
                } catch (error) {
                    console.log('⚠️ Existing browser disconnected, clearing reference');
                    globalBrowser = null;
                }
            }

            // Try to connect to an existing browser via remote debugging
            try {
                const response = await fetch('http://localhost:9222/json/version');
                const data = await response.json();
                const webSocketDebuggerUrl = data.webSocketDebuggerUrl;
                if (webSocketDebuggerUrl) {
                    console.log('🔄 Connecting to existing browser via remote debugging');
                    globalBrowser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
                    return globalBrowser;
                }
            } catch (error) {
                console.log('⚠️ No existing browser found via remote debugging, launching new instance');
            }

            // Launch browser with minimal settings for RDP automation
            const launchOptions = {
                headless: false, // Must stay visible for RDP automation
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-extensions',
                    '--no-first-run',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--remote-debugging-port=9222',
                    '--disable-dev-shm-usage',
                    '--start-maximized'
                ],
                executablePath: process.env.CHROME_PATH || undefined,
                userDataDir: path.join(__dirname, 'puppeteer_data'),
                defaultViewport: null,
                ignoreDefaultArgs: ['--disable-extensions'],
                protocolTimeout: 18000000 // 300 minutes for slow RDP environments
            };

            try {
                globalBrowser = await puppeteer.launch(launchOptions);
                console.log('🚀 Launched new browser instance (CapCut cache & cookies preserved)');
            } catch (error) {
                console.error('❌ Failed to launch new browser:', error.message);
                if (editorId && editors[editorId]) {
                    editors[editorId].result = 'error';
                    saveEditors(editors);
                    console.log('📝 Editor status set to error due to browser launch failure');
                }
                throw new Error(`Failed to launch browser process: ${error.message}`);
            }

            return globalBrowser;
        }

        // Use the browser instance for new page
        browser = await getBrowserInstance(editorUrl);
        page = await browser.newPage();
        console.log('🌐 Created new tab for automation');
        
        // Register this tab for switching if multiple automations are running
        const editorId = editorUrl ? editorUrl.split('/editor/')[1]?.split('?')[0] : 'unknown';
        addEditorTab(editorId, page);
        
        // Ensure browser window is maximized and visible
        try {
            // Force window to maximize and focus
            await page.evaluate(() => {
                // Force window focus
                window.focus();
                // Maximize window to full screen
                if (window.screen && window.resizeTo && window.moveTo) {
                    window.resizeTo(window.screen.availWidth, window.screen.availHeight);
                    window.moveTo(0, 0);
                }
                // Ensure window is not minimized
                if (document.hidden) {
                    document.dispatchEvent(new Event('visibilitychange'));
                }
            });
            
            // Bring to front
            await page.bringToFront();
            console.log('✅ Browser window maximized to full screen and brought to front');
        } catch (error) {
            console.log('⚠️ Could not ensure window visibility:', error.message);
        }
        
        // RDP-compatible helper functions for reliable interactions
        async function rdpSafeClick(selector, options = {}) {
            const element = await page.waitForSelector(selector, { visible: true, timeout: 30000, ...options });
            
            // Ensure browser window is focused and visible
            await page.bringToFront();
            await page.evaluate(() => window.focus());
            
            // Multiple click methods for RDP compatibility
            try {
                // Method 1: Standard click
                await element.click();
                console.log(`✅ Successfully clicked: ${selector}`);
                return true;
            } catch (error1) {
                console.log(`⚠️ Standard click failed, trying evaluate click...`);
                try {
                    // Method 2: JavaScript click via evaluate
                    await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (el) {
                            el.click();
                            return true;
                        }
                        return false;
                    }, selector);
                    console.log(`✅ Successfully clicked via evaluate: ${selector}`);
                    return true;
                } catch (error2) {
                    console.log(`⚠️ Evaluate click failed, trying coordinate click...`);
                    try {
                        // Method 3: Coordinate-based click
                        const box = await element.boundingBox();
                        if (box) {
                            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                            console.log(`✅ Successfully clicked via coordinates: ${selector}`);
                            return true;
                        }
                    } catch (error3) {
                        console.error(`❌ All click methods failed for ${selector}:`, error3.message);
                        throw error3;
                    }
                }
            }
        }
        
        async function ensureBrowserFocus() {
            try {
                await page.bringToFront();
                await page.evaluate(() => {
                    window.focus();
                    document.body.focus();
                });
                // Small delay to ensure focus is applied
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.log('⚠️ Could not ensure browser focus:', error.message);
            }
        }
        
        // Set viewport to match reference app
        await page.setViewport({ width: 1280, height: 720 });
        
        // Load cookies if available
        const cookiesPath = path.join(__dirname, 'cookies.json');
        if (fs.existsSync(cookiesPath)) {
            try {
                const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
                if (Array.isArray(cookies) && cookies.length > 0) {
                    await page.setCookie(...cookies);
                    console.log(`✅ Loaded ${cookies.length} cookies for authentication`);
                    if (progressCallback) progressCallback(`🍪 Loaded ${cookies.length} cookies for login`);
                } else {
                    console.log('⚠️ cookies.json exists but contains no valid cookies');
                }
            } catch (error) {
                console.warn('⚠️ Failed to load cookies:', error.message);
                if (progressCallback) progressCallback('⚠️ Cookie loading failed - continuing without login');
            }
        } else {
            console.log('ℹ️ No cookies.json file found - continuing without authentication');
        }

        // Use the editorUrl from status management, or set fallback if not set
        if (!editorUrl) {
            const editorsPath = path.join(__dirname, 'editors.json');
            editorUrl = 'https://www.capcut.com/editor'; // fallback
            
            if (fs.existsSync(editorsPath)) {
                try {
                    const editorsData = JSON.parse(fs.readFileSync(editorsPath, 'utf8'));
                    const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
                    const availableEditors = editors.filter(editor => editor.status === 'available');
                    
                    if (availableEditors.length > 0) {
                        editorUrl = availableEditors[0].url; // Use first available editor
                    } else if (editors.length > 0) {
                        editorUrl = editors[0].url; // Use first editor if all are in-use
                    }
                } catch (error) {
                    console.log('⚠️ Using default CapCut page');
                }
            }
        }
        
        console.log(`✅ Using editor: ${editorUrl.substring(0, 50)}...`);

        console.log('🌐 Loading CapCut...');
        await page.goto(editorUrl, { 
            waitUntil: 'networkidle2',
            timeout: 420000  // 7 minutes for very slow CapCut loading
        });

        if (progressCallback) progressCallback('📄 Page loaded, waiting for timeline...');

        // Wait for timeline loading to complete before starting upload
        console.log('⏳ Waiting for timeline to load...');
        try {
            // Wait for loading indicator to disappear
            await page.waitForFunction(() => {
                const loadingElement = document.querySelector("#timeline > div > div.timeline-loading-text-WcR4E_");
                return !loadingElement || loadingElement.style.display === 'none';
            }, { timeout: 360000 }); // 6 minutes for timeline loading
            
            console.log('✅ Timeline loaded successfully');
            if (progressCallback) progressCallback('✅ Timeline ready, starting upload...');
        } catch (error) {
            console.log('⚠️ Timeline loading timeout, continuing anyway...');
        }

        // Click the main 'Upload' button using reference app selector
        console.log('📤 Finding main Upload button...');
        const uploadButtonSelector = 'span[data-ssr-i18n-key="uploa_web_d"]';
        console.log('✅ Clicking main Upload button...');
        await rdpSafeClick(uploadButtonSelector);

        // Initiate the file chooser using reference app method
        console.log('📁 Opening file chooser...');
        
        // Ensure browser is focused before file chooser interaction
        await ensureBrowserFocus();
        
        const [fileChooser] = await Promise.all([
            page.waitForFileChooser({ timeout: 300000 }),  // 5 minutes
            // RDP-compatible way to click the 'Upload file' button inside the panel
            (async () => {
                // First try to find and click using text content
                try {
                    const uploadFileSpan = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('span'));
                        const uploadFileButton = buttons.find(el => el.textContent.trim() === 'Upload file');
                        if (uploadFileButton) {
                            uploadFileButton.click();
                            return true;
                        }
                        return false;
                    });
                    
                    if (!uploadFileSpan) {
                        // Fallback: try upload area selector
                        const uploadAreaSelector = 'div[class*="upload-item-content"]';
                        try {
                            await rdpSafeClick(uploadAreaSelector);
                        } catch (error) {
                            throw new Error('Could not find the \'Upload file\' button or area.');
                        }
                    }
                } catch (error) {
                    console.error('❌ File chooser click failed:', error.message);
                    throw error;
                }
            })()
        ]);

        await fileChooser.accept([videoPath]);
        console.log(`✅ File selected: ${path.basename(videoPath)}`);

        if (progressCallback) progressCallback('📤 Monitoring upload...');

        console.log('⏳ Monitoring upload...');
        
        // Wait for video to appear in media panel (reference app method)
        const videoFileName = path.basename(videoPath);
        console.log(`Waiting for uploaded video "${videoFileName}" to appear in media panel...`);

        // Comprehensive video detection with 20-minute timeout for all selectors
        let videoTextElement;
        const totalTimeout = 1200000; // 20 minutes total
        const startTime = Date.now();
        let attemptCount = 0;
        
        while (!videoTextElement && (Date.now() - startTime) < totalTimeout) {
            attemptCount++;
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const remaining = Math.round((totalTimeout - (Date.now() - startTime)) / 1000);
            console.log(`🔍 Video detection attempt ${attemptCount} (${elapsed}s elapsed, ${remaining}s remaining)...`);
            
            // Method 1: Try XPath selectors
            try {
                const videoElementXPath = `//div[(contains(@class, 'card-item-label') or contains(@class, 'card-item-label-wBnw6O') or contains(@class, 'card-item-label-')) and text()='${videoFileName}'] | //html[1]/body[1]/div[2]/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[1]/div[1]/div[3]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2][text()='${videoFileName}'] | //html[1]/body[1]/div[2]/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[1]/div[1]/div[3]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1][text()='${videoFileName}']`;
                console.log(`🔍 Trying XPath selectors...`);
                videoTextElement = await page.waitForSelector(`xpath/${videoElementXPath}`, { timeout: 3000 });
                if (videoTextElement) {
                    console.log(`✅ Found video using XPath!`);
                    break;
                }
            } catch (xpathError) {
                // Continue to next method
            }
            
            // Method 2: Try CSS selectors with text matching
            if (!videoTextElement) {
                console.log('🔍 Trying CSS selectors with text matching...');
                const cssSelectors = [
                    `div[role=grid] > div > div:nth-child(1) > div > div`,
                    `div.card-item-label-wBnw6O`,
                    `div[class*="card-item-label"]`,
                    `div[class*="card-item-label-"]`
                ];
                
                for (const selector of cssSelectors) {
                    try {
                        const elements = await page.$$(selector);
                        for (const element of elements) {
                            const text = await element.textContent();
                            if (text && text.trim() === videoFileName) {
                                console.log(`✅ Found video using CSS selector: ${selector}`);
                                videoTextElement = element;
                                break;
                            }
                        }
                        if (videoTextElement) break;
                    } catch (cssError) {
                        // Continue to next selector
                    }
                }
            }
            
            // Method 3: Try video card elements (no text matching)
            if (!videoTextElement) {
                console.log('🔍 Trying video card elements as fallback...');
                const cardSelectors = [
                    'div.card-item-ZbJhIs',
                    'div[class*="card-item-"]',
                    'div[id*="cloud-material-item-"]',
                    '//*[@id and contains(@id, "cloud-material-item-")]/div/div[1]'
                ];
                
                for (const selector of cardSelectors) {
                    try {
                        let cardElements;
                        
                        if (selector.startsWith('//')) {
                            cardElements = await page.$x(selector);
                        } else {
                            cardElements = await page.$$(selector);
                        }
                        
                        if (cardElements && cardElements.length > 0) {
                            console.log(`✅ Found ${cardElements.length} video card(s) with selector: ${selector}`);
                            console.log('✅ Using first video card as fallback (no text matching)');
                            videoTextElement = cardElements[0];
                            break;
                        }
                    } catch (cardError) {
                        // Continue to next selector
                    }
                }
            }
            
            // If still not found, wait and retry (but check time limit)
            if (!videoTextElement && (Date.now() - startTime) < totalTimeout) {
                console.log(`⏳ Video not found yet, waiting 10 seconds before next attempt...`);
                await page.waitForTimeout(10000); // Shorter wait between attempts
            }
        }
        
        if (!videoTextElement) {
            throw new Error(`Could not find video "${videoFileName}" in media panel after 20 minutes of trying all selector methods`);
        }
        console.log(`✅ Found video "${videoFileName}" in media panel!`);

        // Get the parent container (media item)
        const mediaItemContainer = await videoTextElement.evaluateHandle(node => node.parentElement);

        // Wait for upload & transcode to complete (status overlay disappears)
        console.log('⏳ Waiting for upload & transcode to complete...');
        const statusOverlaySelector = 'div[class*="status-mask"]';

        await mediaItemContainer.evaluate((node, selector) => {
            return new Promise((resolve, reject) => {
                const checkInterval = 1000; // Check every second
                const timeout = 2700000; // 45 minutes timeout
                let elapsedTime = 0;

                const intervalId = setInterval(() => {
                    const overlay = node.querySelector(selector);
                    if (!overlay) {
                        // Overlay gone = upload complete
                        clearInterval(intervalId);
                        resolve();
                        return;
                    }

                    const rect = overlay.getBoundingClientRect();
                    // Upload complete when overlay has no size
                    if (rect.width === 0 && rect.height === 0) {
                        clearInterval(intervalId);
                        resolve();
                        return;
                    }

                    elapsedTime += checkInterval;
                    if (elapsedTime >= timeout) {
                        clearInterval(intervalId);
                        reject(new Error('Upload timeout: status overlay remained visible'));
                    }
                }, checkInterval);
            });
        }, statusOverlaySelector);

        console.log(`✅ Video "${videoFileName}" uploaded and transcoded successfully!`);
        if (progressCallback) progressCallback(`✅ Video "${videoFileName}" upload completed!`);

        // Wait for upload badge to disappear before adding to timeline
        console.log('🔍 Checking for upload badge...');
        if (progressCallback) progressCallback('🔍 Waiting for upload badge to clear...');
        
        try {
            const uploadBadgeSelectors = [
                // Your exact selectors from the HTML
                '#workbench > div.lv-layout-sider.lv-layout-sider > div > div.layout-container.lv-theme-force_dark.smooth-width-transition > div > div > div > div.header-Kdaeiy > div.workspace-and-upload-list-section-XRnq32 > div.upload-task-icon-JXoMbD > span > span > span',
                'xpath//*[@id="workbench"]/div[1]/div/div[2]/div/div/div/div[1]/div[1]/div[2]/span/span/span',
                // Fallback selectors
                '.upload-task-icon-JXoMbD span span span',
                'span.lv-badge-number.badge-dwkIhr',
                '.upload-task-icon-JXoMbD span.lv-badge-number',
                'xpath//span[@class="lv-badge-number badge-dwkIhr badge-zoom-enter-done"]',
                'xpath//*[@id="workbench"]/div[1]/div/div[2]/div/div/div/div[1]/div[1]/div[2]/span/span'
            ];
            
            let uploadBadgeFound = false;
            let loadingElement = null;
            
            // Check for loading image with short timeout
            for (const selector of uploadBadgeSelectors) {
                try {
                    console.log(`🔍 Testing upload badge selector: ${selector}`);
                    let badgeElement;
                    if (selector.startsWith('xpath//')) {
                        const xpath = selector.replace('xpath//', '');
                        badgeElement = await page.waitForSelector(`xpath/${xpath}`, { timeout: 3000 });
                    } else {
                        badgeElement = await page.$(selector);
                    }
                    
                    if (badgeElement) {
                        // Get the badge text/content for debugging
                        const badgeText = await badgeElement.evaluate(el => el.textContent || el.innerText || 'no text');
                        uploadBadgeFound = true;
                        console.log(`🔍 Found upload badge with selector: ${selector}`);
                        console.log(`📊 Badge content: "${badgeText}"`);
                        if (progressCallback) progressCallback(`⏳ Upload badge detected (${badgeText}), waiting for completion...`);
                        
                        // Wait for badge to disappear (up to 40 minutes) with popup monitoring
                        console.log('⏳ Waiting for upload badge to disappear (up to 40 minutes)...');
                        
                        // Monitor for both badge disappearance and "Continue uploading" popup
                        const startTime = Date.now();
                        const maxWaitTime = 2400000; // 40 minutes
                        let badgeDisappeared = false;
                        
                        while (!badgeDisappeared && (Date.now() - startTime) < maxWaitTime) {
                            // Check for "Continue uploading" popup and click it
                            try {
                                const continuePopupSelectors = [
                                    'button:has-text("Continue uploading")',
                                    'button.lv-btn.lv-btn-secondary:has-text("Continue uploading")',
                                    'xpath//button[contains(@class, "lv-btn") and .//span[text()="Continue uploading"]]',
                                    'xpath///html/body/div[12]/div[2]/div/div[2]/div[3]/div/button[1]',
                                    'body > div:nth-child(73) > div.lv-modal-wrapper.lv-modal-wrapper-align-center > div > div:nth-child(2) > div.lv-modal-footer > div > button.lv-btn.lv-btn-secondary.lv-btn-size-default.lv-btn-shape-square.max-size-modal-button'
                                ];
                                
                                for (const popupSelector of continuePopupSelectors) {
                                    try {
                                        let continueButton = null;
                                        if (popupSelector.startsWith('xpath//')) {
                                            const xpath = popupSelector.replace('xpath//', '');
                                            continueButton = await page.$x(xpath);
                                            continueButton = continueButton[0];
                                        } else {
                                            continueButton = await page.$(popupSelector);
                                        }
                                        
                                        if (continueButton) {
                                            console.log('🔄 Found "Continue uploading" popup - clicking to continue...');
                                            if (progressCallback) progressCallback('🔄 Clicking "Continue uploading" popup...');
                                            await continueButton.click();
                                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds after click
                                            console.log('✅ "Continue uploading" popup clicked successfully');
                                            break;
                                        }
                                    } catch (popupError) {
                                        // Continue to next selector if this one fails
                                    }
                                }
                            } catch (popupCheckError) {
                                // Continue monitoring if popup check fails
                            }
                            
                            // Check if upload badge has disappeared
                            try {
                                let badgeElement = null;
                                if (selector.startsWith('xpath//')) {
                                    const xpath = selector.replace('xpath//', '');
                                    const result = await page.evaluate((xpath) => {
                                        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                                        return result.singleNodeValue;
                                    }, xpath);
                                    badgeElement = result;
                                } else {
                                    badgeElement = await page.$(selector);
                                }
                                
                                if (!badgeElement) {
                                    badgeDisappeared = true;
                                    break;
                                }
                            } catch (badgeCheckError) {
                                // Continue monitoring if badge check fails
                            }
                            
                            // Wait 3 seconds before next check
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                        
                        if (!badgeDisappeared) {
                            throw new Error('Upload badge monitoring timeout after 40 minutes');
                        }
                        
                        console.log('✅ Upload badge disappeared - upload fully complete!');
                        if (progressCallback) progressCallback('✅ Upload badge cleared - ready for timeline!');
                        break;
                    } else {
                        console.log(`❌ Upload badge NOT found with selector: ${selector}`);
                    }
                } catch (e) {
                    console.log(`⚠️ Upload badge selector failed: ${selector} - ${e.message}`);
                }
            }
            
            if (!uploadBadgeFound) {
                console.log('✅ No upload badge found - upload already complete');
                if (progressCallback) progressCallback('✅ No upload badge - ready for timeline!');
            }
            
        } catch (e) {
            console.log('⚠️ Upload badge check failed, proceeding anyway:', e.message);
            if (progressCallback) progressCallback('⚠️ Upload badge check timeout - proceeding...');
        }

        // Click the media item to add it to timeline with robust fallback selectors
        console.log('🎬 Adding video to timeline...');
        
        let videoAddedToTimeline = false;
        const timelineAddSelectors = [
            // Method 1: Try using the existing video element (if not detached)
            async () => {
                try {
                    const freshMediaItemContainer = await videoTextElement.evaluateHandle(node => node.parentElement);
                    const mediaItemElement = await freshMediaItemContainer.asElement();
                    await mediaItemElement.click();
                    return true;
                } catch (e) {
                    console.log('⚠️ Method 1 failed (DOM detachment):', e.message);
                    return false;
                }
            },
            
            // Method 2: Use exact CapCut video card structure
            async () => {
                try {
                    console.log('🔄 Method 2: Using exact CapCut card structure...');
                    
                    // Target the exact CapCut video card structure
                    const cardSelectors = [
                        'div.card-item__content-nKehsC',
                        'div[class*="card-item__content"]',
                        'div[class*="card-container"]',
                        '.card-item__content-nKehsC',
                        '.children-BxrZUf',
                        '.card-container-tIRTNo'
                    ];
                    
                    for (const selector of cardSelectors) {
                        try {
                            const elements = await page.$$(selector);
                            if (elements && elements.length > 0) {
                                // Click the first video card found
                                await elements[0].click();
                                console.log(`✅ Video clicked using CapCut card selector: ${selector}`);
                                return true;
                            }
                        } catch (e) {
                            console.log(`⚠️ Card selector failed: ${selector}`);
                        }
                    }
                    
                    // Fallback: Try to find any card with video content
                    try {
                        const videoCardXPath = '//div[contains(@class, "card-item__content") or contains(@class, "card-container")]';
                        const cardElement = await page.waitForSelector(`xpath/${videoCardXPath}`, { timeout: 2000 });
                        if (cardElement) {
                            await cardElement.click();
                            console.log('✅ Video clicked using XPath card selector');
                            return true;
                        }
                    } catch (e) {
                        console.log('⚠️ XPath card selector failed:', e.message);
                    }
                    
                    return false;
                } catch (e) {
                    console.log('⚠️ Method 2 failed:', e.message);
                    return false;
                }
            }
        ];
        
        // Try each method until one succeeds
        for (let i = 0; i < timelineAddSelectors.length; i++) {
            try {
                console.log(`🔄 Trying timeline addition method ${i + 1}/${timelineAddSelectors.length}...`);
                const success = await timelineAddSelectors[i]();
                if (success) {
                    videoAddedToTimeline = true;
                    console.log('✅ Video successfully added to timeline!');
                    if (progressCallback) progressCallback('🎬 Video added to timeline successfully!');
                    break;
                }
            } catch (e) {
                console.log(`⚠️ Timeline addition method ${i + 1} failed:`, e.message);
            }
        }
        
        if (!videoAddedToTimeline) {
            throw new Error('Failed to add video to timeline - all selector methods failed');
        }

        // Monitor for video loading completion (if loading image appears)
        console.log('🔍 Checking for video loading indicator...');
        if (progressCallback) progressCallback('🔍 Checking for video loading...');
        
        try {
            // Check if loading image is present
            const loadingImageSelectors = [
                'img[src*="loading-gray"]',
                'img[alt="loading"]',
                'xpath///*[@id="workbench-editor-container"]/div[1]/div[1]/div/div/div/div/div/img'
            ];
            
            let loadingImageFound = false;
            let loadingElement = null;
            
            // Check for loading image with short timeout
            for (const selector of loadingImageSelectors) {
                try {
                    if (selector.startsWith('xpath//')) {
                        const xpath = selector.replace('xpath//', '');
                        loadingElement = await page.waitForSelector(`xpath/${xpath}`, { timeout: 2000 });
                    } else {
                        loadingElement = await page.waitForSelector(selector, { timeout: 2000 });
                    }
                    if (loadingElement) {
                        loadingImageFound = true;
                        console.log(`🔍 Found loading image with selector: ${selector}`);
                        if (progressCallback) progressCallback('⏳ Video loading detected, waiting for completion...');
                        break;
                    }
                } catch (e) {
                    // Loading image not found with this selector, try next
                }
            }
            
            if (loadingImageFound && loadingElement) {
                // Wait for loading image to disappear (up to 10 minutes)
                console.log('⏳ Waiting for video loading to complete (up to 10 minutes)...');
                await page.waitForFunction(
                    (element) => {
                        return !element || element.offsetHeight === 0 || element.style.display === 'none' || !document.contains(element);
                    },
                    { timeout: 10 * 60 * 1000, polling: 2000 }, // 10 minutes timeout, check every 2 seconds
                    loadingElement
                );
                console.log('✅ Video loading completed successfully!');
                if (progressCallback) progressCallback('✅ Video loading completed!');
            } else {
                console.log('✅ No loading indicator found - video ready immediately');
                if (progressCallback) progressCallback('✅ Video ready immediately');
            }
            
        } catch (loadingError) {
            console.log('⚠️ Video loading monitor timeout or error:', loadingError.message);
            if (progressCallback) progressCallback('⚠️ Video loading monitor timeout - continuing anyway');
        }

        // Wait 6 seconds before changing project name
        console.log('⏳ Waiting 6 seconds before changing project name...');
        await page.waitForTimeout(6000);

        // Change project name to match uploaded filename (reference app method)
        try {
            const originalFileName = path.basename(videoPath, path.extname(videoPath));
            console.log(`📝 Changing project name to: ${originalFileName}`);
            if (progressCallback) progressCallback(`📝 Changing project name to: ${originalFileName}`);
            
            // Try to find and click the project name element (reference app selectors)
            const projectNameSelectors = [
                'div.draft-input__read-only',
                '//*[@id="workbench"]/div[2]/div[1]/div[1]/div[2]/div/div/div/div[3]/div'
            ];
            
            let projectNameElement = null;
            for (const selector of projectNameSelectors) {
                try {
                    if (selector.startsWith('//')) {
                        // XPath selector
                        projectNameElement = await page.waitForSelector(`xpath/${selector}`, { timeout: 3000 });
                    } else {
                        // CSS selector
                        projectNameElement = await page.waitForSelector(selector, { timeout: 3000 });
                    }
                    if (projectNameElement) {
                        console.log(`✅ Found project name element using: ${selector}`);
                        break;
                    }
                } catch (err) {
                    console.log(`⚠️ Project name selector ${selector} failed:`, err.message);
                }
            }
            
            if (projectNameElement) {
                // Click on the project name to edit it
                await projectNameElement.click();
                await page.waitForTimeout(500);
                
                // Select all and replace with new name
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await page.waitForTimeout(200);
                
                await page.keyboard.type(originalFileName);
                await page.waitForTimeout(300);
                
                // Press Enter to confirm
                await page.keyboard.press('Enter');
                await page.waitForTimeout(1000);
                
                console.log(`✅ Project name changed to: ${originalFileName}`);
                if (progressCallback) progressCallback(`✅ Project name changed to: ${originalFileName}`);
                
                // Wait 10 seconds for CapCut UI to fully stabilize after project name change
                console.log('⏳ Waiting 10 seconds for UI to stabilize after project name change...');
                await page.waitForTimeout(10000);
                console.log('✅ UI stabilization wait complete');
                
            } else {
                console.log('⚠️ Could not find project name element to change');
                if (progressCallback) progressCallback('⚠️ Could not find project name element to change');
            }
        } catch (nameError) {
            console.log('⚠️ Could not change project name:', nameError.message);
            if (progressCallback) progressCallback(`⚠️ Failed to change project name: ${nameError.message}`);
        }

        // Final step: Zoom in timeline 18 times (reference app method)
        try {
            console.log('🔍 Zooming in timeline 18 times for better precision...');
            if (progressCallback) progressCallback('🔍 Zooming in timeline 18 times...');
            
            for (let i = 0; i < 18; i++) {
                const clicked = await page.evaluate(() => {
                    // Find the timeline tools container
                    const timelineTools = document.querySelector('#timeline-part-view .timeline-tools-right');
                    if (!timelineTools) return false;
                    
                    // Get all buttons in the timeline tools
                    const buttons = timelineTools.querySelectorAll('button');
                    
                    // The 5th button should be the zoom-in button (index 4)
                    const zoomInButton = buttons[4]; // 5th button (0-indexed)
                    if (zoomInButton) {
                        zoomInButton.click();
                        return true;
                    }
                    return false;
                });
                
                if (clicked) {
                    console.log(`✅ Zoom-in click ${i + 1}/18`);
                    await page.waitForTimeout(300); // Small delay between clicks
                } else {
                    console.log('⚠️ Zoom-in button not found, continuing anyway');
                    break;
                }
            }
            console.log('✅ Timeline zoomed in 18 times successfully');
            if (progressCallback) progressCallback('✅ Timeline zoomed in 18 times successfully');
            await page.waitForTimeout(1000); // Wait for zoom to settle
        } catch (zoomError) {
            console.log('⚠️ Could not zoom in timeline, continuing anyway:', zoomError.message);
            if (progressCallback) progressCallback('⚠️ Could not zoom in timeline, continuing anyway');
        }

        // Final step: Click timeline canvas (reference app method)
        try {
            console.log('🎯 Clicking timeline canvas after zoom...');
            if (progressCallback) progressCallback('🎯 Clicking timeline canvas...');
            
            const timelineCanvasSelectors = [
                'div#timeline > div:nth-child(2) > span > span > div > div.timeline-scroll-wrap > div.timeline-bd-vertical-scroll-icatUb > div.timeline-large-container > div[role=presentation] > canvas',
                'div.timeline-large-container > div[role=presentation] > canvas',
                'div.timeline-scroll-wrap canvas',
                'div.konvajs-content canvas',
                '#timeline canvas'
            ];
            
            let canvasClicked = false;
            for (const selector of timelineCanvasSelectors) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 3000 });
                    await page.click(selector);
                    console.log(`✅ Successfully clicked timeline canvas with selector: ${selector}`);
                    canvasClicked = true;
                    break;
                } catch (e) {
                    console.log(`⚠️ Timeline canvas selector failed: ${selector}`);
                }
            }
            
            if (!canvasClicked) {
                // Fallback: Use XPath (reference app method)
                console.log('🔄 Trying XPath fallback for timeline canvas...');
                try {
                    const xpathSelector = '//html[1]/body[1]/div[2]/div[1]/div[1]/div[2]/div[2]/div[1]/div[2]/div[1]/div[1]/div[1]/div[3]/div[1]/div[2]/span[1]/span[1]/div[1]/div[2]/div[3]/div[2]/div[1]/canvas[1]';
                    const [canvasElement] = await page.$x(xpathSelector);
                    if (canvasElement) {
                        await canvasElement.click();
                        console.log('✅ Successfully clicked timeline canvas using XPath');
                        canvasClicked = true;
                    }
                } catch (xpathError) {
                    console.log('⚠️ XPath timeline canvas click failed:', xpathError.message);
                }
            }
            
            if (canvasClicked) {
                await page.waitForTimeout(1000); // Wait for canvas interaction to register
                console.log('✅ Timeline canvas clicked successfully');
                if (progressCallback) progressCallback('✅ Timeline canvas clicked successfully');
            } else {
                console.log('⚠️ Could not click timeline canvas with any method');
                if (progressCallback) progressCallback('⚠️ Could not click timeline canvas');
            }
        } catch (canvasError) {
            console.log('⚠️ Timeline canvas click error:', canvasError.message);
            if (progressCallback) progressCallback('⚠️ Timeline canvas click failed');
        }

        // Final step: Smart AI Tools - Remove Background (reference app method)
        try {
            console.log('🤖 Starting Smart AI Tools - Remove Background...');
            if (progressCallback) progressCallback('🤖 Starting Smart AI Tools - Remove Background...');
            
            // Click video cutout button
            await page.waitForTimeout(1000);
            const cutoutButtonSelector = '#workbench-tool-bar-toolbarVideoCutout';
            await page.click(cutoutButtonSelector);
            console.log('✅ Clicked video cutout button');
            
            // Click remove backgrounds option with multiple fallbacks (automatic removal only)
            await page.waitForTimeout(2000); // Wait for UI to load
            console.log('🔍 Looking for automatic remove backgrounds option...');
            
            const cutoutCardSelectors = [
                '#cutout-card',
                '.cutout-card'
            ];
            
            let cutoutCardClicked = false;
            
            // Try reliable selectors for cutout card
            for (const selector of cutoutCardSelectors) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 3000 });
                    await page.click(selector);
                    console.log(`✅ Successfully clicked remove backgrounds with selector: ${selector}`);
                    cutoutCardClicked = true;
                    break;
                } catch (e) {
                    console.log(`⚠️ Cutout card selector failed: ${selector}`);
                }
            }
            
            if (!cutoutCardClicked) {
                console.log('⚠️ Could not find remove backgrounds option, but continuing...');
            }
            
            // Click cutout switch with specific background removal targeting
            await page.waitForTimeout(1000);
            console.log('🔍 Searching specifically for the background removal switch...');
            if (progressCallback) progressCallback('🔍 Searching for Remove Background switch...');
            
            const switchButtonHandle = await page.evaluateHandle(() => {
                // Method 1: Find by "Remove backgrounds automatically" text specifically
                const automaticRemovalElements = Array.from(document.querySelectorAll('div.attribute-switch-field-des1'));
                const automaticRemovalDiv = automaticRemovalElements.find(el => 
                    el.textContent.includes('Remove backgrounds automatically')
                );
                
                if (automaticRemovalDiv) {
                    // Find the switch within the same container as the "Remove backgrounds automatically" text
                    const container = automaticRemovalDiv.closest('.video-tool-item, .cutout-card, .tool-item, .panel-item, .attribute-switch-field');
                    if (container) {
                        const switchButton = container.querySelector('button[role="switch"]');
                        if (switchButton) {
                            return switchButton;
                        }
                    }
                }

                // Method 2: Find by cutout-specific selectors (exclude float-mode-panel)
                const directSelectors = [
                    '#cutout-switch button[role="switch"]',
                    '[data-testid="cutout-switch"] button[role="switch"]',
                    '[data-testid="auto-cutout-switch"]'
                ];

                for (const selector of directSelectors) {
                    const element = document.querySelector(selector);
                    if (element && element.offsetHeight > 0) {
                        return element;
                    }
                }

                // Method 3: Find switch by nearby text (exclude float-mode-panel)
                const allSwitches = Array.from(document.querySelectorAll('button[role="switch"]'));
                for (const switchBtn of allSwitches) {
                    // Skip switches in float-mode-panel-container
                    const floatModePanel = switchBtn.closest('#float-mode-panel-container');
                    if (floatModePanel) continue;
                    
                    const parent = switchBtn.closest('div');
                    if (parent) {
                        const parentText = parent.innerText.toLowerCase();
                        if (parentText.includes('remove backgrounds automatically') || 
                            (parentText.includes('cutout') && parentText.includes('auto'))) {
                            return switchBtn;
                        }
                    }
                }

                return null;
            });

            const switchElement = switchButtonHandle.asElement();
            if (switchElement) {
                await switchElement.click();
                console.log('✅ Successfully found and clicked the cutout switch');
                if (progressCallback) progressCallback('✅ Remove Background switch activated!');
                
                // Monitor for background removal completion with retry logic
                console.log('⏳ Monitoring background removal for up to 300 minutes...');
                if (progressCallback) progressCallback('⏳ Monitoring background removal progress...');
                
                let retryCount = 0;
                const maxRetries = 4;
                let backgroundRemovalComplete = false;
                
                while (!backgroundRemovalComplete && retryCount <= maxRetries) {
                    try {
                        const result = await page.waitForFunction(() => {
                            // Find the specific background removal switch (not chroma key or other switches)
                            let backgroundRemovalSwitch = null;
                            
                            // Method 1: Find by "Remove backgrounds automatically" text
                            const automaticRemovalElements = Array.from(document.querySelectorAll('div.attribute-switch-field-des1'));
                            const automaticRemovalDiv = automaticRemovalElements.find(el => 
                                el.textContent.includes('Remove backgrounds automatically')
                            );
                            
                            if (automaticRemovalDiv) {
                                const container = automaticRemovalDiv.closest('.video-tool-item, .cutout-card, .tool-item, .panel-item, .attribute-switch-field');
                                if (container) {
                                    backgroundRemovalSwitch = container.querySelector('button[role="switch"]');
                                }
                            }
                            
                            // Method 2: Find by cutout-specific selectors (exclude float-mode-panel and chroma key)
                            if (!backgroundRemovalSwitch) {
                                const cutoutSelectors = [
                                    '#cutout-switch button[role="switch"]',
                                    '[data-testid="cutout-switch"] button[role="switch"]',
                                    '[data-testid="auto-cutout-switch"]'
                                ];
                                
                                for (const selector of cutoutSelectors) {
                                    const element = document.querySelector(selector);
                                    if (element && element.offsetHeight > 0) {
                                        backgroundRemovalSwitch = element;
                                        break;
                                    }
                                }
                            }
                            
                            // Method 3: Find by nearby text (exclude float-mode-panel and chroma key)
                            if (!backgroundRemovalSwitch) {
                                const allSwitches = Array.from(document.querySelectorAll('button[role="switch"]'));
                                for (const switchBtn of allSwitches) {
                                    // Skip switches in float-mode-panel-container
                                    const floatModePanel = switchBtn.closest('#float-mode-panel-container');
                                    if (floatModePanel) continue;
                                    
                                    const parent = switchBtn.closest('div');
                                    if (parent) {
                                        const parentText = parent.innerText.toLowerCase();
                                        if (parentText.includes('remove backgrounds automatically') || 
                                            (parentText.includes('cutout') && parentText.includes('auto'))) {
                                            backgroundRemovalSwitch = switchBtn;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            if (!backgroundRemovalSwitch) {
                                return false; // Continue waiting if we can't find the specific switch
                            }
                            
                            // Check if the specific background removal switch failed (turned to false)
                            if (backgroundRemovalSwitch.getAttribute('aria-checked') === 'false') {
                                return 'FAILED'; // Return special value for failed state
                            }
                            
                            // Check for successful completion (switch is true and not loading)
                            if (backgroundRemovalSwitch.getAttribute('aria-checked') === 'true') {
                                const isLoading = backgroundRemovalSwitch.classList.contains('lv-switch-loading') || 
                                                backgroundRemovalSwitch.querySelector('.lv-icon-loading');
                                if (!isLoading) {
                                    return 'SUCCESS'; // Return special value for success
                                }
                            }
                            
                            return false; // Continue waiting
                        }, { timeout: 300 * 60 * 1000, polling: 5000 }); // 300 minutes timeout, check every 5 seconds

                        const resultValue = await result.jsonValue();
                        
                        if (resultValue === 'SUCCESS') {
                            console.log('✅ Background removal completed successfully!');
                            if (progressCallback) progressCallback('✅ Background removal completed successfully!');
                            backgroundRemovalComplete = true;
                        } else if (resultValue === 'FAILED') {
                            retryCount++;
                            console.log(`⚠️ Background removal failed (switch turned off). Retry ${retryCount}/${maxRetries}...`);
                            if (progressCallback) progressCallback(`⚠️ Background removal failed. Retry ${retryCount}/${maxRetries}...`);
                            
                            if (retryCount <= maxRetries) {
                                // Click the switch again to retry
                                try {
                                    // Try CSS selector first
                                    const failedSwitch = await page.$('button[role="switch"][aria-checked="false"]');
                                    if (failedSwitch) {
                                        await failedSwitch.click();
                                        console.log('✅ Clicked failed switch to retry (CSS selector)');
                                    } else {
                                        // Try XPath selector as fallback
                                        const failedSwitchXPath = await page.$x('//*[@id="cutout-switch"]/div/div/div/div/button[@aria-checked="false"]');
                                        if (failedSwitchXPath.length > 0) {
                                            await failedSwitchXPath[0].click();
                                            console.log('✅ Clicked failed switch to retry (XPath selector)');
                                        }
                                    }
                                    if (progressCallback) progressCallback(`🔄 Retrying background removal (${retryCount}/${maxRetries})...`);
                                    await page.waitForTimeout(2000); // Wait 2 seconds before monitoring again
                                } catch (retryError) {
                                    console.log('⚠️ Failed to click switch for retry:', retryError.message);
                                    break;
                                }
                            } else {
                                console.log('❌ Maximum retries reached. Background removal failed.');
                                if (progressCallback) progressCallback('❌ Background removal failed after retries');
                                throw new Error('Background removal failed after maximum retries');
                            }
                        }
                        
                    } catch (monitoringError) {
                        // If this is a background removal failure (not a timeout), re-throw it to fail automation
                        if (monitoringError.message.includes('Background removal failed after maximum retries')) {
                            throw monitoringError; // Re-throw background removal failures
                        }
                        console.log('⚠️ Background removal monitoring timeout or error:', monitoringError.message);
                        if (progressCallback) progressCallback('⚠️ Background removal monitoring timeout');
                        break;
                    }
                }
                
                if (backgroundRemovalComplete) {
                    // Monitor for saving completion by watching loading image disappear
                    console.log('🔍 Monitoring background removal saving completion...');
                    if (progressCallback) progressCallback('🔍 Monitoring saving completion...');
                    
                    try {
                        // Check if loading image appears during saving (same selectors as video loading monitor)
                        const savingLoadingSelectors = [
                            'img[src*="loading-gray"]',
                            'img[alt="loading"]',
                            'xpath///*[@id="workbench-editor-container"]/div[1]/div[1]/div/div/div/div/div/img'
                        ];
                        
                        let savingLoadingFound = false;
                        let savingLoadingElement = null;
                        
                        // Check for loading image with short timeout
                        for (const selector of savingLoadingSelectors) {
                            try {
                                if (selector.startsWith('xpath//')) {
                                    const xpath = selector.replace('xpath//', '');
                                    savingLoadingElement = await page.waitForSelector(`xpath/${xpath}`, { timeout: 5000 });
                                } else {
                                    savingLoadingElement = await page.waitForSelector(selector, { timeout: 5000 });
                                }
                                if (savingLoadingElement) {
                                    savingLoadingFound = true;
                                    console.log(`🔍 Found saving loading image with selector: ${selector}`);
                                    if (progressCallback) progressCallback('⏳ Background removal saving in progress...');
                                    break;
                                }
                            } catch (e) {
                                // Loading image not found with this selector, try next
                            }
                        }
                        
                        if (savingLoadingFound && savingLoadingElement) {
                            // Wait for loading image to disappear OR cloud save completion icon to appear (up to 1 minute)
                            console.log('⏳ Waiting for saving loading to complete (up to 1 minute)...');
                            
                            const savingCompleted = await page.waitForFunction(
                                (element) => {
                                    // Check if loading image disappeared
                                    const loadingDisappeared = !element || element.offsetHeight === 0 || element.style.display === 'none' || !document.contains(element);
                                    
                                    // Check if cloud save animation has stopped (more precise detection)
                                    const cloudSaveContainer = document.querySelector('#cloud-draft-async');
                                    if (cloudSaveContainer && cloudSaveContainer.offsetHeight > 0) {
                                        // Check if the uploading animation arrow is still present/active
                                        const animationArrow = cloudSaveContainer.querySelector('.uploading-animation-arrow');
                                        const isAnimating = animationArrow && animationArrow.offsetHeight > 0;
                                        
                                        // Only consider cloud save completed if animation has stopped
                                        const cloudSaveCompleted = !isAnimating;
                                        return loadingDisappeared || cloudSaveCompleted;
                                    }
                                    
                                    // Fallback: if no cloud save container, rely on loading image disappearance
                                    return loadingDisappeared;
                                },
                                { timeout: 1 * 60 * 1000, polling: 2000 }, // 1 minute timeout, check every 2 seconds
                                savingLoadingElement
                            );
                            
                            // Check which condition was met - animation stopped or loading disappeared
                            const cloudSaveContainer = await page.$('#cloud-draft-async');
                            const animationArrow = cloudSaveContainer ? await cloudSaveContainer.$('.uploading-animation-arrow') : null;
                            const isStillAnimating = animationArrow && await animationArrow.evaluate(el => el.offsetHeight > 0);
                            
                            if (cloudSaveContainer && !isStillAnimating) {
                                console.log('✅ Background removal saving completed successfully! (Cloud save animation stopped)');
                                if (progressCallback) progressCallback('✅ Background removal saving completed! (Animation stopped)');
                            } else {
                                console.log('✅ Background removal saving completed successfully! (Loading disappeared)');
                                if (progressCallback) progressCallback('✅ Background removal saving completed!');
                            }
                        } else {
                            // No loading indicator found - check for immediate cloud save completion
                            try {
                                const immediateCloudSave = await page.waitForSelector('#cloud-draft-async svg', { timeout: 5000 });
                                if (immediateCloudSave) {
                                    console.log('✅ Background removal saved immediately (Cloud save icon detected)');
                                    if (progressCallback) progressCallback('✅ Background removal saved immediately (Cloud saved)');
                                } else {
                                    console.log('✅ No saving loading indicator found - background removal saved immediately');
                                    if (progressCallback) progressCallback('✅ Background removal saved immediately');
                                }
                            } catch (e) {
                                console.log('✅ No saving loading indicator found - background removal saved immediately');
                                if (progressCallback) progressCallback('✅ Background removal saved immediately');
                            }
                        }
                        
                    } catch (savingError) {
                        console.log('⚠️ Saving monitor timeout or error:', savingError.message);
                        if (progressCallback) progressCallback('⚠️ Saving monitor timeout - assuming saved');
                        // Continue anyway - assume saving completed
                    }
                    
                    // Final step: Wait 25 seconds and show success message with video name
                    console.log('⏳ Waiting 25 seconds for final processing...');
                    if (progressCallback) progressCallback('⏳ Final processing (25 seconds)...');
                    await page.waitForTimeout(25000); // 25 seconds = 25,000ms
                    
                    // Get the video name from the uploaded file
                    const videoName = path.basename(videoPath, path.extname(videoPath));
                    console.log(`🎉 SUCCESS! Video background removed successfully: "${videoName}"`);
                    if (progressCallback) progressCallback(`🎉 SUCCESS! Background removed: "${videoName}"`);
                    
                    // Log successful completion to Google Sheets
                    try {
                        console.log('📊 Logging successful completion to Google Sheets...');
                        if (progressCallback) progressCallback('📊 Logging to Google Sheets...');
                        
                        // Get video metadata from videos.json
                        let videoDescription = '';
                        try {
                            const videosJsonPath = path.join(__dirname, 'videos.json');
                            if (fs.existsSync(videosJsonPath)) {
                                const videosData = JSON.parse(fs.readFileSync(videosJsonPath, 'utf8'));
                                const videoEntry = videosData.videos.find(v => v.filename === path.basename(videoPath));
                                if (videoEntry) {
                                    videoDescription = videoEntry.description || '';
                                }
                            }
                        } catch (metadataError) {
                            console.log('⚠️ Could not retrieve video metadata for Google Sheets:', metadataError.message);
                        }
                        
                        // Clean the original URL (remove any timestamp prefixes if present)
                        let cleanUrl = originalUrl || 'Unknown URL';
                        if (cleanUrl.includes(' - ')) {
                            // Remove timestamp prefix if present (format: "2025-08-15T04:36:29.736Z - URL")
                            cleanUrl = cleanUrl.split(' - ').pop().trim();
                        }
                        
                        const sheetsData = {
                            title: videoName,
                            description: videoDescription,
                            editorUrl: editorUrl,
                            originalUrl: cleanUrl
                        };
                        
                        const sheetsResult = await googleSheets.logVideoCompletion(sheetsData);
                        if (sheetsResult.success) {
                            console.log('✅ Successfully logged to Google Sheets');
                            if (progressCallback) progressCallback('✅ Logged to Google Sheets');
                            
                            // Clean up .info.json file after successful Google Sheets logging
                            try {
                                const infoJsonPath = videoPath.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i, '.info.json');
                                if (fs.existsSync(infoJsonPath)) {
                                    fs.unlinkSync(infoJsonPath);
                                    console.log(`🗑️ Deleted info file: "${path.basename(infoJsonPath)}"`);
                                    if (progressCallback) progressCallback('🗑️ Cleanup: Info file deleted');
                                } else {
                                    console.log(`ℹ️ Info file not found for cleanup: "${path.basename(infoJsonPath)}"`);
                                }
                            } catch (infoCleanupError) {
                                console.log(`⚠️ Failed to delete info file: ${infoCleanupError.message}`);
                            }
                        } else {
                            console.log('⚠️ Google Sheets logging failed:', sheetsResult.error || sheetsResult.reason);
                        }
                        
                    } catch (sheetsError) {
                        console.log('⚠️ Google Sheets logging error:', sheetsError.message);
                        // Don't fail the automation for Google Sheets errors
                    }
                    
                    // Final cleanup: Delete the original video file from uploads folder
                    try {
                        if (fs.existsSync(videoPath)) {
                            fs.unlinkSync(videoPath);
                            console.log(`🗑️ Deleted original video file: "${videoName}"`);
                            if (progressCallback) progressCallback(`🗑️ Cleanup: Original file deleted`);
                        } else {
                            console.log(`⚠️ Original video file not found for deletion: "${videoName}"`);
                        }
                    } catch (deleteError) {
                        console.log(`⚠️ Failed to delete original video file: ${deleteError.message}`);
                        if (progressCallback) progressCallback(`⚠️ Cleanup warning: Could not delete original file`);
                    }
                }
                
            } else {
                console.log('⚠️ Could not find the cutout switch');
                if (progressCallback) progressCallback('⚠️ Could not find Remove Background switch');
                throw new Error('Could not find Remove Background switch - automation failed');
            }
            
        } catch (removeBackgroundError) {
            console.log('⚠️ Remove background error:', removeBackgroundError.message);
            if (progressCallback) progressCallback('⚠️ Remove background failed');
            throw removeBackgroundError; // Re-throw to fail the automation
        }

        // Update editor result to "complete" on success
        try {
            const editorsPath = path.join(__dirname, 'editors.json');
            if (fs.existsSync(editorsPath)) {
                const editorsData = JSON.parse(fs.readFileSync(editorsPath, 'utf8'));
                const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
                const currentEditor = editors.find(editor => editor.url === editorUrl);
                if (currentEditor) {
                    currentEditor.result = 'complete';
                    fs.writeFileSync(editorsPath, JSON.stringify(editorsData, null, 4));
                }
            }
        } catch (updateError) {
            console.log('⚠️ Could not update editor result status');
        }

        return { success: true, message: 'Upload completed successfully' };

    } catch (error) {
        // Enhanced error handling for DOM detachment and concurrent automation issues
        let errorType = 'unknown';
        if (error.message.includes('Node is detached from document')) {
            errorType = 'dom_detached';
            console.log('🔄 DOM detachment detected - likely due to concurrent automation conflicts');
            if (progressCallback) progressCallback('🔄 DOM conflict detected - concurrent automation issue');
        } else if (error.message.includes('Navigation timeout')) {
            errorType = 'navigation_timeout';
            console.log('⏳ Navigation timeout - CapCut may be slow or unresponsive');
            if (progressCallback) progressCallback('⏳ Navigation timeout - CapCut slow response');
        } else if (error.message.includes('Target closed')) {
            errorType = 'target_closed';
            console.log('🚪 Browser tab closed unexpectedly');
            if (progressCallback) progressCallback('🚪 Browser tab closed unexpectedly');
        }
        
        // Update editor result to "error" on failure
        try {
            const editorsPath = path.join(__dirname, 'editors.json');
            if (fs.existsSync(editorsPath)) {
                const editorsData = JSON.parse(fs.readFileSync(editorsPath, 'utf8'));
                const editors = Array.isArray(editorsData) ? editorsData : editorsData.editors;
                const currentEditor = editors.find(editor => editor.url === editorUrl);
                if (currentEditor) {
                    currentEditor.result = 'error';
                    currentEditor.errorType = errorType; // Track error type for debugging
                    fs.writeFileSync(editorsPath, JSON.stringify(editorsData, null, 4));
                }
            }
        } catch (updateError) {
            console.log('⚠️ Could not update editor result status');
        }
        
        // Delete failed video from uploads folder for cleanup
        try {
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
                console.log('🗑️ Deleted failed video file for cleanup:', path.basename(videoPath));
                if (progressCallback) progressCallback('🗑️ Cleanup: Failed video deleted');
            }
        } catch (deleteError) {
            console.log('⚠️ Could not delete failed video file:', deleteError.message);
        }
        
        // Delete corresponding .info.json file for cleanup
        try {
            if (videoPath) {
                const infoJsonPath = videoPath.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i, '.info.json');
                if (fs.existsSync(infoJsonPath)) {
                    fs.unlinkSync(infoJsonPath);
                    console.log('🗑️ Deleted failed info file for cleanup:', path.basename(infoJsonPath));
                    if (progressCallback) progressCallback('🗑️ Cleanup: Failed info file deleted');
                } else {
                    console.log('ℹ️ Info file not found for cleanup:', path.basename(infoJsonPath));
                }
            }
        } catch (infoDeleteError) {
            console.log('⚠️ Could not delete failed info file:', infoDeleteError.message);
        }
        
        // Don't log here - error already shown above, just re-throw
        throw error;
    } finally {
        // Remove this tab from switching rotation
        const editorId = editorUrl ? editorUrl.split('/editor/')[1]?.split('?')[0] : 'unknown';
        removeEditorTab(editorId);
        
        // Keep editor status as "in-use" - do not reset to available
        console.log('📝 Editor remains "in-use" for future automations');
        
        // Robust tab/context cleanup for RDP environments
        if (page) {
            try {
                // First, try to clear any running scripts/contexts
                try {
                    await page.evaluate(() => {
                        // Clear any running intervals/timeouts
                        for (let i = 1; i < 99999; i++) {
                            clearInterval(i);
                            clearTimeout(i);
                        }
                        // Clear page references
                        window.stop && window.stop();
                    });
                } catch (evalError) {
                    console.log('⚠️ Context cleanup evaluation failed (expected on destroyed context)');
                }
                
                // Close the page/tab
                await page.close();
                console.log('📄 Tab closed with context cleanup, browser instance kept running for reuse');
            } catch (closeError) {
                console.log('⚠️ Could not close tab:', closeError.message);
                // Force close if normal close fails
                try {
                    await page.close();
                } catch (forceError) {
                    console.log('⚠️ Force close also failed:', forceError.message);
                }
            }
        }
        
        // Keep browser instance running for future automations
        if (browser) {
            console.log('🌐 Browser instance kept running for future automations');
            console.log('💡 Multiple tabs can now use the same browser process');
        }
    }
}

module.exports = {
    runSimpleUpload
};
