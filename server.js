const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const https = require('https');

const app = express();
const PORT = 3000;
const HTTPS_PORT = 3443;
const VIDEO_DIR = path.join(__dirname, 'videos');

// Global variable to control verbose logging
let verboseLogging = false;

if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR);
}

app.use(express.urlencoded({ extended: true }));

// Home page: form to submit video URL
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>3DS Video Converter</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: "Courier New", monospace;
          background: #0a0a0a;
          color: #3a8a3a;
          padding: 15px;
          margin: 0;
          font-size: 14px;
        }
        
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: #1a1a1a;
          border: 2px solid #3a8a3a;
          padding: 20px;
        }
        
        h1 {
          text-align: center;
          margin-bottom: 20px;
          font-size: 20px;
          color: #5ab85a;
          font-weight: normal;
          border-bottom: 1px solid #3a8a3a;
          padding-bottom: 10px;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        input[type="url"] {
          width: 100%;
          padding: 8px;
          border: 1px solid #3a8a3a;
          background: #0a0a0a;
          color: #5ab85a;
          font-size: 14px;
          font-family: "Courier New", monospace;
        }
        
        input[type="url"]:focus {
          outline: none;
          border-color: #6ac86a;
        }
        
        input[type="url"]::placeholder {
          color: #404040;
        }
        
        button, input[type="button"] {
          width: 100%;
          padding: 10px;
          background: #0a0a0a;
          color: #5ab85a;
          border: 1px solid #3a8a3a;
          font-size: 14px;
          font-family: "Courier New", monospace;
          cursor: pointer;
        }
        
        button:hover, input[type="button"]:hover {
          background: #3a8a3a;
          color: #0a0a0a;
        }
        
        .delete-all-btn {
          background: #0a0a0a !important;
          color: #b85a5a !important;
          border-color: #b85a5a !important;
        }
        
        .delete-all-btn:hover {
          background: #b85a5a !important;
          color: #0a0a0a !important;
        }
        
        .separator {
          height: 1px;
          background: #3a8a3a;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>3DS Video Converter</h1>
        <div>
          <div class="form-group">
            <input type="url" id="videoUrl" placeholder="Enter video URL here..." required />
          </div>
          <input type="button" value="Convert Video" onclick="convertVideo()" />
        </div>
        
        <div class="separator"></div>
        
        <div>
          <a href="/delete-all" onclick="return confirm('Delete all videos?');">
            <input type="button" value="Delete All Videos" class="delete-all-btn" />
          </a>
        </div>
      </div>
      
      <script>
        function convertVideo() {
          var url = document.getElementById('videoUrl').value;
          if (!url) {
            alert('Please enter a video URL');
            return;
          }
          
          // Simple redirect approach for 3DS browser compatibility
          var encodedUrl = encodeURIComponent(url);
          window.location.href = '/convert?url=' + encodedUrl;
        }
      </script>
    </body>
    </html>
  `);
});

// Function to extract direct video URL from common hosting sites
function extractDirectVideoUrl(url) {
  // Wikipedia Commons - extract direct file URL
  if (url.includes('commons.wikimedia.org/wiki/File:')) {
    const fileName = url.split('/File:')[1];
    if (fileName) {
      return `https://upload.wikimedia.org/wikipedia/commons/${fileName}`;
    }
  }
  
  // YouTube - would need youtube-dl or similar
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return null; // YouTube requires special handling
  }
  
  // For other URLs, return as-is
  return url;
}

// Function to search for direct video links on a webpage
async function findVideoLinksOnPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }
    
    const html = await response.text();
    
    if (verboseLogging) {
      console.log('Searching for div with id="image-download-link"');
    }
    
    // Look for div with id="image-download-link" containing an <a> tag
    // This matches: <div id="image-download-link"><a href="...">...</a></div>
    const divPattern = /<div[^>]*id=["']image-download-link["'][^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/div>/gi;
    const divMatch = html.match(divPattern);
    
    if (divMatch) {
      if (verboseLogging) {
        console.log('Found div with id="image-download-link"');
        console.log('Div content:', divMatch[0]);
      }
      
      // Extract the href from the <a> tag inside the div
      const hrefPattern = /href=["']([^"']+)["']/i;
      const hrefMatch = divMatch[0].match(hrefPattern);
      
      if (hrefMatch) {
        const videoUrl = hrefMatch[1];
        if (verboseLogging) {
          console.log('Found href in image-download-link div:', videoUrl);
        }
        
        // Check if the found URL has a period in the last 5 characters
        if (isValidVideoUrl(videoUrl)) {
          if (verboseLogging) {
            console.log('URL appears to be a valid video file');
          }
          return videoUrl;
        } else {
          if (verboseLogging) {
            console.log('URL does not appear to be a valid video file');
          }
        }
      } else {
        if (verboseLogging) {
          console.log('No href found in image-download-link div');
        }
      }
    } else {
      if (verboseLogging) {
        console.log('No div with id="image-download-link" found on page');
        
        // Let's search for any div with that ID to see what's there
        const anyDivPattern = /<div[^>]*id=["']image-download-link["'][^>]*>[\s\S]*?<\/div>/gi;
        const anyDivMatch = html.match(anyDivPattern);
        if (anyDivMatch) {
          console.log('Found div with id="image-download-link" but no <a> tag inside:');
          console.log('Div content:', anyDivMatch[0]);
        }
        
        // Also search for any <a> tags to see what links are available
        const allLinksPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
        const allLinks = html.match(allLinksPattern);
        if (allLinks && allLinks.length > 0) {
          console.log('Found', allLinks.length, 'links on the page');
          console.log('First few links:', allLinks.slice(0, 3));
        }
      }
    }
    
    return null;
  } catch (error) {
    if (verboseLogging) {
      console.error('Error searching for video links:', error);
    }
    return null;
  }
}

// Helper function to check if a URL is a valid video link
function isValidVideoUrl(url) {
  if (!url || url.startsWith('#')) return false;
  
  // Check if there's a period in the last 5 characters (likely a file extension)
  const last5Chars = url.slice(-5);
  const hasFileExtension = last5Chars.includes('.');
  
  // Check for video hosting domains (these are special cases)
  const videoHosts = [
    'youtube.com', 'vimeo.com', 'dailymotion.com', 'twitch.tv',
    'facebook.com', 'instagram.com', 'tiktok.com', 'reddit.com'
  ];
  
  const isVideoHost = videoHosts.some(host => 
    url.toLowerCase().includes(host)
  );
  
  const isValid = hasFileExtension || isVideoHost;
  
  if (verboseLogging) {
    console.log('URL validation:', {
      url: url,
      last5Chars: last5Chars,
      hasFileExtension,
      isVideoHost,
      isValid
    });
  }
  
  return isValid;
}

// Helper function to extract video URL from JSON-LD data
function extractVideoFromJsonLd(data) {
  if (typeof data === 'object' && data !== null) {
    // Check for video content
    if (data['@type'] === 'VideoObject' && data.contentUrl) {
      return data.contentUrl;
    }
    
    // Check for embedded video
    if (data['@type'] === 'VideoObject' && data.embedUrl) {
      return data.embedUrl;
    }
    
    // Recursively search nested objects
    for (const key in data) {
      if (typeof data[key] === 'object') {
        const result = extractVideoFromJsonLd(data[key]);
        if (result) return result;
      }
    }
  }
  
  return null;
}

// Handle video conversion (GET method for 3DS compatibility)
app.get('/convert', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('No URL provided');
  
  // Try to extract direct video URL
  let directUrl = extractDirectVideoUrl(videoUrl);
  if (directUrl && directUrl !== videoUrl) {
    if (verboseLogging) {
      console.log('Extracted direct URL:', directUrl);
    }
  }
  
  const id = uuidv4();
  const inputPath = path.join(VIDEO_DIR, `${id}_input`);
  const aviOutputPath = path.join(VIDEO_DIR, `${id}.avi`);
  const mp4OutputPath = path.join(VIDEO_DIR, `${id}.mp4`);

  if (verboseLogging) {
    console.log('Processing video URL:', videoUrl);
    if (directUrl && directUrl !== videoUrl) {
      console.log('Using direct URL:', directUrl);
    }
    console.log('Input path:', inputPath);
    console.log('AVI output path:', aviOutputPath);
    console.log('MP4 output path:', mp4OutputPath);
  }

  try {
    // Check if the URL looks like a direct video file first
    let downloadUrl = directUrl || videoUrl;
    
    if (verboseLogging) {
      console.log('Checking URL structure:', downloadUrl);
    }
    
    // If the URL doesn't look like a direct video file, search for video links first
    if (!isValidVideoUrl(downloadUrl)) {
      if (verboseLogging) {
        console.log('URL does not appear to be a direct video file, searching for video links on page...');
      }
      
      const foundVideoUrl = await findVideoLinksOnPage(downloadUrl);
      if (foundVideoUrl) {
        if (verboseLogging) {
          console.log('Found video link on page:', foundVideoUrl);
        }
        downloadUrl = foundVideoUrl;
      } else {
        throw new Error('No video links found on the webpage. Please provide a direct link to a video file.');
      }
    }
    
    // Now download the video (either original or found)
    if (verboseLogging) {
      console.log('Downloading video from:', downloadUrl);
    }
    
    let response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    if (!response.ok) throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    
    // Check content type to see if it's actually a video file
    const contentType = response.headers.get('content-type');
    if (verboseLogging) {
      console.log('Content-Type:', contentType);
    }
    
    // If we still got HTML, something went wrong
    if (contentType && contentType.includes('text/html')) {
      throw new Error('The found URL still returns HTML content. Please provide a direct link to a video file.');
    }
    
    const fileStream = fs.createWriteStream(inputPath);
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    const fileSize = fs.statSync(inputPath).size;
    if (verboseLogging) {
      console.log('Download completed. File size:', fileSize, 'bytes');
    }
    
    // Check if file is too small (likely HTML page)
    if (fileSize < 10000) { // Less than 10KB
      const fileContent = fs.readFileSync(inputPath, 'utf8').substring(0, 500);
      if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE')) {
        throw new Error('Downloaded file appears to be HTML, not a video. Please use a direct link to the video file.');
      }
    }

    // Convert to MP4 (H.264) optimized for 3DS browser compatibility
    // 3DS supports: H.264 video (max 854x480), AAC audio, MP4 container
    // Using conservative settings for maximum compatibility
    const mp4Cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=480:240:force_original_aspect_ratio=decrease,pad=480:240:(ow-iw)/2:(oh-ih)/2" -r 25 -c:v libx264 -profile:v baseline -level 3.0 -preset ultrafast -crf 28 -c:a aac -b:a 96k -ar 44100 -ac 2 -movflags +faststart -f mp4 "${mp4OutputPath}"`;
    
    if (verboseLogging) {
      console.log('Converting to MP4 (3DS compatible)...');
    }
    exec(mp4Cmd, (err, stdout, stderr) => {
      fs.unlinkSync(inputPath); // Remove input file
      if (err) {
        console.error('MP4 conversion error:', err);
        console.error('MP4 conversion stderr:', stderr);
        fs.existsSync(mp4OutputPath) && fs.unlinkSync(mp4OutputPath);
        return res.status(500).send(`MP4 conversion failed: ${err.message}`);
      } else if (verboseLogging) {
        console.log('MP4 conversion completed');
      }
      res.redirect(`/video/${id}`);
    });
  } catch (e) {
    console.error('Error during processing:', e);
    if (verboseLogging) {
      console.error('Stack trace:', e.stack);
    }
    fs.existsSync(inputPath) && fs.unlinkSync(inputPath);
    res.status(500).send(`Error: ${e.message}<br><br>Stack trace:<br><pre>${e.stack}</pre>`);
  }
});

// Serve video page
app.get('/video/:id', (req, res) => {
  const id = req.params.id;
  const mp4Path = path.join(VIDEO_DIR, `${id}.mp4`);
  
  if (!fs.existsSync(mp4Path)) {
    return res.status(404).send('Video not found');
  }
  
  // Always use HTTP URL for video sources (3DS compatibility)
  // Extract host without port or force HTTP port
  let host = req.get('host');
  if (host.includes(':')) {
    host = host.split(':')[0]; // Remove port
  }
  const videoUrl = `http://${host}:${PORT}/videos/${id}.mp4`;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Video - 3DS Converter</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: "Courier New", monospace;
          background: #0a0a0a;
          color: #3a8a3a;
          padding: 15px;
          margin: 0;
          font-size: 14px;
        }
        
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: #1a1a1a;
          border: 2px solid #3a8a3a;
          padding: 20px;
        }
        
        h1 {
          text-align: center;
          margin-bottom: 20px;
          font-size: 20px;
          color: #5ab85a;
          font-weight: normal;
          border-bottom: 1px solid #3a8a3a;
          padding-bottom: 10px;
        }
        
        video {
          width: 100%;
          max-width: 480px;
          height: 240px;
          background: #000;
          margin-bottom: 20px;
          border: 1px solid #3a8a3a;
        }
        
        .links {
          margin: 20px 0;
        }
        
        .links a {
          display: block;
          width: 100%;
          padding: 10px;
          background: #0a0a0a;
          color: #5ab85a;
          text-decoration: none;
          border: 1px solid #3a8a3a;
          font-size: 14px;
          font-family: "Courier New", monospace;
          margin-bottom: 8px;
          text-align: center;
        }
        
        .links a:hover {
          background: #3a8a3a;
          color: #0a0a0a;
        }
        
        .delete-btn {
          background: #0a0a0a !important;
          color: #b85a5a !important;
          border-color: #b85a5a !important;
        }
        
        .delete-btn:hover {
          background: #b85a5a !important;
          color: #0a0a0a !important;
        }
        
        .back-btn {
          background: #0a0a0a !important;
          color: #5a8ab8 !important;
          border-color: #5a8ab8 !important;
        }
        
        .back-btn:hover {
          background: #5a8ab8 !important;
          color: #0a0a0a !important;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Converted Video</h1>
        <video controls preload="metadata">
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support video playback.
        </video>
        <div class="links">
          <a href="${videoUrl}" download>Download MP4</a>
          <a href="/delete/${id}" onclick="return confirm('Delete video?');" class="delete-btn">Delete</a>
          <a href="/" class="back-btn">Back</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Serve video files with proper streaming and CORS headers
app.get('/videos/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(VIDEO_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  // Add CORS headers for 3DS compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Handle delete (GET method for 3DS compatibility)
app.get('/delete/:id', (req, res) => {
  const id = req.params.id;
  const mp4Path = path.join(VIDEO_DIR, `${id}.mp4`);
  
  if (fs.existsSync(mp4Path)) {
    fs.unlinkSync(mp4Path);
  }
  res.redirect('/');
});

// Handle delete all videos (GET method for 3DS compatibility)
app.get('/delete-all', (req, res) => {
  try {
    const files = fs.readdirSync(VIDEO_DIR);
    let deletedCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(VIDEO_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile() && file.endsWith('.mp4')) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });
    
    if (verboseLogging) {
      console.log(`Deleted ${deletedCount} video files`);
    }
    res.redirect('/');
  } catch (error) {
    console.error('Error deleting all videos:', error);
    res.status(500).send('Error deleting videos');
  }
});



// Function to create self-signed certificate
async function createSelfSignedCert() {
  const certPath = path.join(__dirname, 'cert.pem');
  const keyPath = path.join(__dirname, 'key.pem');
  
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log('Creating self-signed certificate for HTTPS...');
    
    try {
      // Try using mkcert package first (more reliable)
      const mkcert = require('mkcert');
      const ca = await mkcert.createCA({
        organization: '3DS Video Converter CA',
        countryCode: 'US',
        state: 'State',
        locality: 'City',
        validityDays: 365
      });
      
      const cert = await mkcert.createCert({
        domains: ['localhost', '127.0.0.1'],
        validityDays: 365,
        caKey: ca.key,
        caCert: ca.cert
      });
      
      fs.writeFileSync(certPath, cert.cert);
      fs.writeFileSync(keyPath, cert.key);
      console.log('Certificate created successfully using mkcert');
    } catch (error) {
      console.log('mkcert failed, trying OpenSSL with 3DS-compatible settings...');
      const { execSync } = require('child_process');
      
      try {
        // Create certificate with older crypto settings for 3DS compatibility
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -sha256 -subj "/C=US/ST=State/L=City/O=3DS Video Converter/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1"`, { stdio: 'inherit' });
        console.log('Certificate created successfully using OpenSSL (3DS compatible)');
      } catch (opensslError) {
        console.error('Failed to create certificate. Please install OpenSSL or run manually:');
        console.error('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -sha256 -subj "/C=US/ST=State/L=City/O=3DS Video Converter/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1"');
        return null;
      }
    }
  }
  
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
}

// Function to ask user about verbose logging
async function askForVerboseLogging() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Enable verbose logging for video processing? (y/n): ', async (answer) => {
    verboseLogging = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    console.log(`Verbose logging: ${verboseLogging ? 'ENABLED' : 'DISABLED'}`);
    rl.close();
    
    // Create HTTPS certificate
    const cert = await createSelfSignedCert();
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`HTTP Server running at http://localhost:${PORT}`);
      console.log(`Verbose logging: ${verboseLogging ? 'ON' : 'OFF'}`);
    });
    
    // Start HTTPS server for 3DS website access
    if (cert) {
      https.createServer(cert, app).listen(HTTPS_PORT, () => {
        console.log(`HTTPS Server running at https://localhost:${HTTPS_PORT}`);
        console.log('Use HTTPS URL for 3DS website access');
        console.log('Videos will be served over HTTP for 3DS compatibility');
      });
    } else {
      console.log('HTTPS server not started due to certificate issues');
      console.log('3DS may not be able to access the website');
    }
  });
}

// Start the server with user prompt
askForVerboseLogging(); 