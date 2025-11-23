const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { runAutomationPipeline } = require('../src/timeline_test'); // Import the timeline automation

// Configure storage for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/')) // Files will be saved in the 'uploads' directory
    },
    filename: function (req, file, cb) {
        // Create a unique filename to avoid overwriting
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

// Define the upload route and trigger automation
router.post('/', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const absoluteFilePath = path.resolve(req.file.path);
    console.log(`File successfully uploaded to: ${absoluteFilePath}`);

    try {
        console.log('Starting CapCut automation pipeline...');
        await runAutomationPipeline(absoluteFilePath);
        res.json({
            success: true,
            message: 'File uploaded and CapCut automation pipeline completed successfully!',
            filePath: absoluteFilePath
        });
    } catch (error) {
        console.error(`CapCut automation pipeline failed: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `File was uploaded to the server, but the CapCut automation pipeline failed. Reason: ${error.message}`
        });
    }
});

module.exports = router;
