const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';
// Path to capture app's output directory (adjust this path as needed)
const CAPTURE_APP_OUTPUT_DIR = process.env.CAPTURE_APP_OUTPUT_DIR || path.join(__dirname, '../../capture-app/backend/printing/output');

// Get card image - uses capture app's direct PNG endpoint
router.get('/:cardId/image', async (req, res) => {
  try {
    const { cardId } = req.params;
    console.log(`Fetching card image for ID: ${cardId}`);
    
    // According to the API guide, the capture app provides:
    // GET /api/idcard/:userId - Returns PNG image directly
    
    // Method 1: Use the official /api/idcard/:userId endpoint (RECOMMENDED)
    try {
      const imageUrl = `${CAPTURE_APP_URL}/api/idcard/${cardId}`;
      console.log(`Fetching from official endpoint: ${imageUrl}`);
      
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        validateStatus: (status) => status === 200
      });
      
      if (imageResponse.data && imageResponse.data.byteLength > 0) {
        console.log(`✅ Successfully fetched card image (${imageResponse.data.byteLength} bytes)`);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        return res.send(Buffer.from(imageResponse.data));
      }
    } catch (error) {
      console.error(`❌ Official endpoint failed: ${error.message}`);
      
      // If it's a 404, the card doesn't exist
      if (error.response && error.response.status === 404) {
        return res.status(404).json({
          success: false,
          message: `Card with ID ${cardId} not found in capture app. The card may not be approved yet.`
        });
      }
      
      // If capture app is offline
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: 'Capture app is not available. Please ensure it is running on port 5001.'
        });
      }
      
      // Other errors - try fallback methods
      console.log('Trying fallback methods...');
    }
    
    // Method 2: Try alternative endpoints (fallback)
    const fallbackEndpoints = [
      `/api/printing/card-image/${cardId}`,
      `/output/card_${cardId}.png`
    ];
    
    for (const endpoint of fallbackEndpoints) {
      try {
        const imageUrl = `${CAPTURE_APP_URL}${endpoint}`;
        console.log(`Trying fallback endpoint: ${imageUrl}`);
        
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 5000
        });
        
        if (imageResponse.status === 200 && imageResponse.data && imageResponse.data.byteLength > 0) {
          console.log(`✅ Fallback endpoint succeeded (${imageResponse.data.byteLength} bytes)`);
          res.set('Content-Type', 'image/png');
          return res.send(Buffer.from(imageResponse.data));
        }
      } catch (err) {
        console.log(`Fallback endpoint failed: ${endpoint}`);
        continue;
      }
    }
    
    // Method 3: Try file system as last resort (if configured)
    if (CAPTURE_APP_OUTPUT_DIR) {
      console.log('Trying file system access...');
      
      const possibleFilenames = [
        `card_${cardId}.png`,
        `idcard_${cardId}.png`,
        `${cardId}.png`
      ];
      
      for (const filename of possibleFilenames) {
        try {
          const filePath = path.join(CAPTURE_APP_OUTPUT_DIR, filename);
          const imageBuffer = await fs.readFile(filePath);
          
          console.log(`✅ Found card image in file system: ${filename}`);
          res.set('Content-Type', 'image/png');
          return res.send(imageBuffer);
        } catch (err) {
          continue;
        }
      }
    }
    
    // If all methods failed, return helpful error
    console.error('❌ All methods failed to fetch card image');
    return res.status(404).json({
      success: false,
      message: `Card image not found for ID ${cardId}. Please ensure the card is approved in the capture app.`,
      troubleshooting: {
        captureAppUrl: CAPTURE_APP_URL,
        endpoint: `/api/idcard/${cardId}`,
        suggestion: 'Check if the card is approved in the capture app and the PNG was generated.'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching card image:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching card image',
      error: error.message
    });
  }
});

module.exports = router;
