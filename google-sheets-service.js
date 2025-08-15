const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

class GoogleSheetsService {
    constructor() {
        // Web App method configuration
        this.webAppUrl = process.env.GOOGLE_SHEETS_URL;
        
        // Service Account method configuration
        this.serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'capcut-auto@capcut-auto.iam.gserviceaccount.com';
        this.privateKeyPath = process.env.GOOGLE_PRIVATE_KEY_PATH || path.join(__dirname, 'google-service-account-key.json');
        this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '';
        this.sheetName = process.env.GOOGLE_SHEET_NAME || 'Video Completions';
        
        // Service Account tokens
        this.accessToken = null;
        this.tokenExpiry = null;
        
        // Determine which method to use
        this.useServiceAccount = this.checkServiceAccountConfig();
        this.useWebApp = !this.useServiceAccount && !!this.webAppUrl;
        this.enabled = this.useServiceAccount || this.useWebApp;
        
        this.logConfiguration();
    }

    /**
     * Check if service account configuration is available and valid
     */
    checkServiceAccountConfig() {
        if (!this.spreadsheetId) {
            return false;
        }
        
        if (!fs.existsSync(this.privateKeyPath)) {
            return false;
        }
        
        try {
            const keyData = JSON.parse(fs.readFileSync(this.privateKeyPath, 'utf8'));
            return !!(keyData.private_key && keyData.client_email);
        } catch (error) {
            return false;
        }
    }

    /**
     * Log the current configuration
     */
    logConfiguration() {
        if (this.useServiceAccount) {
            console.log('📊 Google Sheets integration enabled (Service Account method)');
            console.log(`📧 Service Account: ${this.serviceAccountEmail}`);
            console.log(`📋 Spreadsheet ID: ${this.spreadsheetId}`);
        } else if (this.useWebApp) {
            console.log('📊 Google Sheets integration enabled (Web App method)');
            console.log(`🔗 Web App URL: ${this.webAppUrl}`);
        } else {
            console.log('📊 Google Sheets integration disabled - no valid configuration found');
        }
    }

    /**
     * Log successful video completion to Google Sheets
     * @param {Object} videoData - Video completion data
     * @param {string} videoData.title - Video title
     * @param {string} videoData.description - Video description
     * @param {string} videoData.editorUrl - CapCut editor URL
     * @param {string} videoData.timestamp - Completion timestamp
     * @param {string} videoData.originalUrl - Original YouTube URL
     */
    async logVideoCompletion(videoData) {
        if (!this.enabled) {
            console.log('📊 Google Sheets logging skipped - not configured');
            return { success: false, reason: 'not_configured' };
        }

        try {
            console.log(`📊 Logging video completion to Google Sheets: "${videoData.title}"`);
            
            if (this.useServiceAccount) {
                return await this.logWithServiceAccount(videoData);
            } else if (this.useWebApp) {
                return await this.logWithWebApp(videoData);
            }

        } catch (error) {
            console.error('❌ Google Sheets logging error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Log video completion using Service Account method
     */
    async logWithServiceAccount(videoData) {
        try {
            const accessToken = await this.getAccessToken();
            
            // Prepare row data (no timestamps)
            const rowData = [
                videoData.title || 'Unknown Title',
                videoData.description || '',
                videoData.editorUrl || '',
                videoData.originalUrl || '',
                'completed'
            ];

            const result = await this.appendRowToSheet(accessToken, rowData);
            
            if (result.success) {
                console.log('✅ Video completion logged to Google Sheets successfully (Service Account)');
                return { success: true, data: result.data };
            } else {
                console.log('❌ Failed to log to Google Sheets:', result.error);
                return { success: false, error: result.error };
            }

        } catch (error) {
            console.error('❌ Service Account logging error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Log video completion using Web App method
     */
    async logWithWebApp(videoData) {
        try {
            const postData = querystring.stringify({
                title: videoData.title || 'Unknown Title',
                description: videoData.description || '',
                editorUrl: videoData.editorUrl || '',
                timestamp: videoData.timestamp || new Date().toISOString(),
                originalUrl: videoData.originalUrl || '',
                action: 'log_completion'
            });

            const result = await this.makeHttpRequest(postData);
            
            if (result.success) {
                console.log('✅ Video completion logged to Google Sheets successfully (Web App)');
                return { success: true, data: result.data };
            } else {
                console.log('❌ Failed to log to Google Sheets:', result.error);
                return { success: false, error: result.error };
            }

        } catch (error) {
            console.error('❌ Web App logging error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Make HTTP request to Google Apps Script Web App
     */
    makeRequest(postData) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.webAppUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 30000 // 30 second timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (parseError) {
                        // If response is not JSON, treat as success if status is 200
                        if (res.statusCode === 200) {
                            resolve({ success: true, data: data });
                        } else {
                            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
                        }
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Get access token using service account (for Service Account method)
     */
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const keyData = JSON.parse(fs.readFileSync(this.privateKeyPath, 'utf8'));
            const jwt = this.createJWT(keyData);
            
            const tokenData = await this.requestAccessToken(jwt);
            this.accessToken = tokenData.access_token;
            this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000; // 1 minute buffer
            
            return this.accessToken;
            
        } catch (error) {
            console.error('❌ Error getting access token:', error.message);
            throw error;
        }
    }

    /**
     * Create JWT for service account authentication
     */
    createJWT(keyData) {
        const crypto = require('crypto');
        
        const header = {
            alg: 'RS256',
            typ: 'JWT'
        };
        
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: keyData.client_email,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now
        };
        
        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureInput), keyData.private_key);
        const encodedSignature = signature.toString('base64url');
        
        return `${signatureInput}.${encodedSignature}`;
    }

    /**
     * Request access token from Google OAuth2
     */
    requestAccessToken(jwt) {
        return new Promise((resolve, reject) => {
            const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
            
            const options = {
                hostname: 'oauth2.googleapis.com',
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.access_token) {
                            resolve(response);
                        } else {
                            reject(new Error(`Token request failed: ${data}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    /**
     * Append row to Google Sheet using Sheets API
     */
    appendRowToSheet(accessToken, rowData) {
        return new Promise((resolve, reject) => {
            const requestBody = {
                values: [rowData]
            };

            const postData = JSON.stringify(requestBody);
            
            const options = {
                hostname: 'sheets.googleapis.com',
                path: `/v4/spreadsheets/${this.spreadsheetId}/values/A1:E:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode === 200) {
                            resolve({ success: true, data: response });
                        } else {
                            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
                        }
                    } catch (error) {
                        resolve({ success: false, error: error.message });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Test the Google Sheets connection
     */
    async testConnection() {
        if (!this.enabled) {
            return { success: false, reason: 'not_configured' };
        }

        try {
            const testData = {
                title: 'Test Connection',
                description: 'Testing Google Sheets integration',
                editorUrl: 'https://test.com',
                timestamp: new Date().toISOString(),
                originalUrl: 'https://test.com'
            };

            const result = await this.logVideoCompletion(testData);
            return result;

        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = GoogleSheetsService;
