# Google Sheets Integration Setup Guide

This guide will help you set up Google Sheets integration to automatically log successful video completions from your CapCut automation system.

## 📊 What Gets Logged

When a video successfully completes background removal, the following data is automatically sent to your Google Sheet:

- **Video Title** - The name of the processed video
- **Description** - YouTube video description (if available)
- **Editor URL** - The CapCut editor URL used for processing
- **Original YouTube URL** - The source YouTube video URL
- **Timestamp** - When the processing completed
- **Status** - Processing status (completed)

## 🚀 Setup Instructions

### Step 1: Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it something like "CapCut Video Completions"
4. Copy the Spreadsheet ID from the URL (the long string between `/d/` and `/edit`)
   - Example: `https://docs.google.com/spreadsheets/d/1ABC123xyz789/edit`
   - Spreadsheet ID: `1ABC123xyz789`

### Step 2: Create Google Apps Script

1. Go to [Google Apps Script](https://script.google.com)
2. Click "New Project"
3. Delete the default code
4. Copy and paste the code from `google-apps-script-template.js`
5. Update the `SPREADSHEET_ID` variable with your Sheet ID from Step 1
6. Save the project (Ctrl+S) and give it a name like "CapCut Automation Logger"

### Step 3: Deploy as Web App

1. In Google Apps Script, click "Deploy" → "New Deployment"
2. Choose type: "Web app"
3. Set execute as: "Me"
4. Set access: "Anyone" (this allows your automation to send data)
5. Click "Deploy"
6. Copy the Web App URL (it will look like: `https://script.google.com/macros/s/ABC123.../exec`)

### Step 4: Configure Your Automation

1. Open your `.env` file in the CapCut automation directory
2. Add your Web App URL:
   ```
   GOOGLE_SHEETS_URL=https://script.google.com/macros/s/YOUR_WEB_APP_ID/exec
   ```
3. Save the file

### Step 5: Test the Integration

1. Restart your CapCut automation server
2. Process a video through the automation
3. Check your Google Sheet - you should see a new row with the video data

## 📋 Expected Google Sheet Format

Your sheet will automatically be formatted with these columns:

| Timestamp | Video Title | Description | Editor URL | Original YouTube URL | Status | Processing Date |
|-----------|-------------|-------------|------------|---------------------|--------|----------------|
| 2025-01-15 04:52:41 | Video Name | Video description | https://capcut.com/editor/... | https://youtube.com/shorts/... | completed | 2025-01-15 04:52:41 |

## 🔧 Troubleshooting

### No Data Appearing in Sheet
- Check that `GOOGLE_SHEETS_URL` is set correctly in `.env`
- Verify the Google Apps Script is deployed with "Anyone" access
- Check the automation logs for Google Sheets error messages

### Permission Errors
- Make sure the Google Apps Script has access to your spreadsheet
- Verify the `SPREADSHEET_ID` is correct in the script

### Connection Test
The automation will automatically test the connection on startup and show:
- ✅ `Google Sheets integration enabled` - if configured correctly
- 📊 `Google Sheets integration disabled` - if not configured

## 🎯 Benefits

- **Automatic logging** - No manual tracking needed
- **Complete audit trail** - Every successful video is recorded
- **Easy reporting** - Use Google Sheets features for analysis
- **Backup data** - Your processing history is safely stored
- **Team collaboration** - Share the sheet with team members

## 🔒 Security Notes

- The Web App URL is public but only accepts data in the expected format
- No sensitive information is logged (only video titles and URLs)
- You can restrict access by changing deployment settings if needed

## 📈 Optional Enhancements

You can modify the Google Apps Script to:
- Add data validation
- Create charts and reports
- Send email notifications
- Filter or categorize videos
- Export data to other systems

Your CapCut automation system will now automatically log all successful video completions to your Google Sheet! 🎉
