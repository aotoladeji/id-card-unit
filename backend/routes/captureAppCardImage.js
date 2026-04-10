const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';
// Path to capture app's output directory (adjust this path as needed)
const CAPTURE_APP_OUTPUT_DIR = process.env.CAPTURE_APP_OUTPUT_DIR || path.join(__dirname, '../../capture-app/backend/printing/output');

const normalizeUrl = (urlValue) => {
  if (!urlValue || typeof urlValue !== 'string') return null;
  const trimmed = urlValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${CAPTURE_APP_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

const extractCardIdCandidates = (file) => {
  if (!file || typeof file !== 'object') return [];
  const keys = ['cardId', 'card_id', 'id', 'userId', 'user_id', 'studentId', 'student_id'];
  const values = keys
    .map((key) => file[key])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim());
  return [...new Set(values)];
};

const matchesCardIdInString = (text, requestedId) => {
  if (!text) return false;
  const safeId = String(requestedId).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^0-9A-Za-z])${safeId}([^0-9A-Za-z]|$)`, 'i');
  return pattern.test(String(text));
};

const findOutputFileUrlForCard = (files, requestedId) => {
  if (!Array.isArray(files) || files.length === 0) return null;

  // 1) Prefer explicit id fields in file records.
  for (const file of files) {
    const candidates = extractCardIdCandidates(file);
    if (candidates.some((value) => value === String(requestedId))) {
      const directUrl = normalizeUrl(file.url || file.path || file.fileUrl);
      if (directUrl) return directUrl;
    }
  }

  // 2) Fallback: try matching card ID in url/name metadata.
  for (const file of files) {
    const candidateText = [file.url, file.path, file.fileUrl, file.filename, file.name]
      .filter(Boolean)
      .join(' ');
    if (matchesCardIdInString(candidateText, requestedId)) {
      const inferredUrl = normalizeUrl(file.url || file.path || file.fileUrl);
      if (inferredUrl) return inferredUrl;
    }
  }

  return null;
};

const fetchImageFromOutputList = async (cardId) => {
  const listResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/output`, {
    timeout: 10000
  });

  const files =
    listResponse.data?.files ||
    listResponse.data?.output ||
    listResponse.data?.data ||
    [];

  const matchedUrl = findOutputFileUrlForCard(files, cardId);
  if (!matchedUrl) return null;

  const imageResponse = await axios.get(matchedUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    validateStatus: (status) => status === 200
  });

  if (imageResponse.data && imageResponse.data.byteLength > 0) {
    return Buffer.from(imageResponse.data);
  }

  return null;
};

const fetchImageFromOutputImage = async (cardId) => {
  const imageResponse = await axios.get(
    `${CAPTURE_APP_URL}/api/printing/output-image?cardId=${encodeURIComponent(cardId)}`,
    {
      responseType: 'arraybuffer',
      timeout: 10000,
      validateStatus: (status) => status === 200
    }
  );

  if (imageResponse.data && imageResponse.data.byteLength > 0) {
    return Buffer.from(imageResponse.data);
  }

  return null;
};

const buildIdCandidates = (requestedId, approvedCard) => {
  const candidates = [requestedId];

  if (approvedCard && typeof approvedCard === 'object') {
    const possibleKeys = [
      'id',
      'user_id',
      'userId',
      'student_id',
      'studentId',
      'capture_id',
      'captureId',
      'card_id',
      'cardId',
      'matric_no',
      'staff_id'
    ];

    for (const key of possibleKeys) {
      const value = approvedCard[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        candidates.push(String(value).trim());
      }
    }
  }

  return [...new Set(candidates.map((value) => String(value).trim()).filter(Boolean))];
};

const fetchImageFromCaptureApp = async (idCandidate) => {
  const imageUrl = `${CAPTURE_APP_URL}/api/idcard/${encodeURIComponent(idCandidate)}`;
  console.log(`Fetching from official endpoint: ${imageUrl}`);

  const imageResponse = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    validateStatus: (status) => status === 200
  });

  if (imageResponse.data && imageResponse.data.byteLength > 0) {
    return Buffer.from(imageResponse.data);
  }

  return null;
};

// Get card image - uses capture app's direct PNG endpoint
router.get('/:cardId/image', async (req, res) => {
  try {
    const { cardId } = req.params;
    console.log(`Fetching card image for ID: ${cardId}`);
    
    // According to the API guide, the capture app provides:
    // GET /api/idcard/:userId - Returns PNG image directly
    
    // Method 1: Use capture output listing and load the file URL for this card.
    try {
      const outputListImage = await fetchImageFromOutputList(cardId);
      if (outputListImage) {
        console.log(`✅ Successfully fetched card image from /api/printing/output for card ${cardId}`);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(outputListImage);
      }
      console.log(`ℹ️ No matched file URL found in /api/printing/output for card ${cardId}`);
    } catch (error) {
      console.error(`❌ /api/printing/output lookup failed: ${error.message}`);

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }
    }

    // Method 2: Fallback to output-image endpoint by card ID.
    try {
      const outputImage = await fetchImageFromOutputImage(cardId);
      if (outputImage) {
        console.log(`✅ Successfully fetched card image from /api/printing/output-image for card ${cardId}`);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(outputImage);
      }
    } catch (error) {
      console.error(`❌ /api/printing/output-image failed: ${error.message}`);

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }
    }

    // Method 3: Legacy /api/idcard/:userId endpoint (kept as fallback)
    try {
      const directImage = await fetchImageFromCaptureApp(cardId);
      if (directImage) {
        console.log(`✅ Successfully fetched card image with direct ID (${directImage.byteLength} bytes)`);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(directImage);
      }
    } catch (error) {
      console.error(`❌ Official endpoint failed: ${error.message}`);

      // If capture app is offline
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }

      // Other errors - try fallback methods
      console.log('Trying fallback methods...');
    }

    // Method 4: Resolve identifier mismatch via approved cards list
    try {
      const approvedResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
        timeout: 10000
      });

      const approvedCards = approvedResponse.data?.cards || [];
      const matchedCard = approvedCards.find((card) =>
        String(card.id) === String(cardId) ||
        String(card.card_id || '') === String(cardId) ||
        String(card.user_id || '') === String(cardId) ||
        String(card.userId || '') === String(cardId)
      );

      if (matchedCard) {
        const idCandidates = buildIdCandidates(cardId, matchedCard);
        console.log(`Resolved ID candidates for ${cardId}:`, idCandidates);

        for (const candidate of idCandidates) {
          try {
            const candidateImage = await fetchImageFromCaptureApp(candidate);
            if (candidateImage) {
              console.log(`✅ Successfully fetched card image with candidate ID: ${candidate}`);
              res.set('Content-Type', 'image/png');
              res.set('Cache-Control', 'public, max-age=3600');
              return res.send(candidateImage);
            }
          } catch (candidateError) {
            if (candidateError.code === 'ECONNREFUSED' || candidateError.code === 'ETIMEDOUT') {
              return res.status(503).json({
                success: false,
                message: `Capture app is not available at ${CAPTURE_APP_URL}.`
              });
            }
          }
        }
      }
    } catch (lookupError) {
      console.log(`Approved-card lookup failed while resolving ID ${cardId}: ${lookupError.message}`);
    }
    
    // Method 5: Try alternative endpoints (fallback)
    const fallbackEndpoints = [
        `/api/printing/card-image/${encodeURIComponent(cardId)}`,
        `/output/card_${encodeURIComponent(cardId)}.png`
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
    
    // Method 6: Try file system as last resort (if configured)
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
