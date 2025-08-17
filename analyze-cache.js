const fs = require('fs');
const path = require('path');

// Function to get directory size recursively
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
        // Silent fail for inaccessible directories
    }
    return totalSize;
}

// Function to format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Analyze puppeteer_data directory
function analyzePuppeteerCache() {
    const puppeteerDataPath = path.join(__dirname, 'puppeteer_data');
    
    if (!fs.existsSync(puppeteerDataPath)) {
        console.log('❌ puppeteer_data directory not found');
        return;
    }
    
    console.log('🔍 Analyzing CapCut Cache Usage...\n');
    
    const directories = fs.readdirSync(puppeteerDataPath);
    const directorySizes = [];
    let totalSize = 0;
    
    // Analyze each directory
    directories.forEach(dir => {
        const dirPath = path.join(puppeteerDataPath, dir);
        if (fs.statSync(dirPath).isDirectory()) {
            const size = getDirectorySize(dirPath);
            directorySizes.push({ name: dir, size, path: dirPath });
            totalSize += size;
        }
    });
    
    // Sort by size (largest first)
    directorySizes.sort((a, b) => b.size - a.size);
    
    console.log('📊 Directory Sizes (Largest to Smallest):');
    console.log('=' .repeat(60));
    
    directorySizes.forEach((dir, index) => {
        const percentage = ((dir.size / totalSize) * 100).toFixed(1);
        const essential = isEssentialForCapCut(dir.name) ? '🔒 ESSENTIAL' : '🗑️  REMOVABLE';
        console.log(`${index + 1}. ${dir.name.padEnd(25)} ${formatBytes(dir.size).padStart(10)} (${percentage}%) ${essential}`);
    });
    
    console.log('=' .repeat(60));
    console.log(`📁 Total Size: ${formatBytes(totalSize)}`);
    
    // Calculate essential vs removable
    const essentialSize = directorySizes
        .filter(dir => isEssentialForCapCut(dir.name))
        .reduce((sum, dir) => sum + dir.size, 0);
    
    const removableSize = totalSize - essentialSize;
    
    console.log(`\n🔒 Essential for CapCut: ${formatBytes(essentialSize)} (${((essentialSize / totalSize) * 100).toFixed(1)}%)`);
    console.log(`🗑️  Can be removed: ${formatBytes(removableSize)} (${((removableSize / totalSize) * 100).toFixed(1)}%)`);
    
    console.log('\n💡 Recommendations:');
    if (removableSize > essentialSize) {
        console.log('   • Significant space can be saved by removing non-essential cache');
    }
    console.log(`   • Minimum CapCut cache needed: ~${formatBytes(essentialSize)}`);
    console.log(`   • Potential space savings: ~${formatBytes(removableSize)}`);
    
    // Analyze Default directory in detail
    const defaultPath = path.join(puppeteerDataPath, 'Default');
    if (fs.existsSync(defaultPath)) {
        console.log('\n🔍 Default Directory Breakdown:');
        console.log('-' .repeat(40));
        
        const defaultDirs = fs.readdirSync(defaultPath);
        const defaultSizes = [];
        
        defaultDirs.forEach(subDir => {
            const subDirPath = path.join(defaultPath, subDir);
            if (fs.statSync(subDirPath).isDirectory()) {
                const size = getDirectorySize(subDirPath);
                const essential = isEssentialDefaultDir(subDir) ? '🔒' : '🗑️';
                defaultSizes.push({ name: subDir, size, essential });
            }
        });
        
        defaultSizes.sort((a, b) => b.size - a.size);
        defaultSizes.forEach(dir => {
            console.log(`${dir.essential} ${dir.name.padEnd(20)} ${formatBytes(dir.size).padStart(10)}`);
        });
    }
}

// Define what's essential for CapCut functionality
function isEssentialForCapCut(dirName) {
    const essential = [
        'Default',           // Contains cookies, local storage, preferences
        'Safe Browsing'      // Security features
    ];
    return essential.includes(dirName);
}

// Define what's essential in Default directory
function isEssentialDefaultDir(dirName) {
    const essential = [
        'Cookies',           // Login sessions
        'Local Storage',     // User preferences
        'Session Storage',   // Active session data
        'Preferences',       // Browser settings
        'Web Data'          // Form data, autofill
    ];
    return essential.includes(dirName);
}

// Run analysis
analyzePuppeteerCache();
