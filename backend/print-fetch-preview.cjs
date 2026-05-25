const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

// Force backend env so DB config matches the running API server.
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const pool = require('./config/database');

const BACKEND_BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:5000';

async function getLatestApprovedCard() {
  const queries = [
    `SELECT card_id AS id, TRIM(CONCAT(COALESCE(surname,''), ' ', COALESCE(other_names,''))) AS student_name, matric_no FROM approved_cards ORDER BY id DESC LIMIT 1`,
    `SELECT card_id AS id, TRIM(CONCAT(COALESCE(surname,''), ' ', COALESCE(other_names,''))) AS student_name, matric_no FROM approved_cards ORDER BY created_at DESC LIMIT 1`,
    `SELECT card_id AS id, TRIM(CONCAT(COALESCE(surname,''), ' ', COALESCE(other_names,''))) AS student_name, matric_no FROM print_queue ORDER BY id DESC LIMIT 1`,
    `SELECT card_id AS id, TRIM(CONCAT(COALESCE(surname,''), ' ', COALESCE(other_names,''))) AS student_name, matric_no FROM print_history ORDER BY id DESC LIMIT 1`,
    `SELECT id, full_name AS student_name, matric_number AS matric_no FROM id_cards ORDER BY id DESC LIMIT 1`,
  ];

  for (const sql of queries) {
    try {
      const result = await pool.query(sql);
      if (result.rows && result.rows[0]) {
        return result.rows[0];
      }
    } catch (error) {
      // Try next query shape if schema differs.
    }
  }

  return null;
}

async function checkBackendHealth() {
  const pingUrl = `${BACKEND_BASE_URL}/api/ping`;
  const response = await axios.get(pingUrl, {
    timeout: 5000,
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    throw new Error(`Backend ping failed (${response.status}) at ${pingUrl}`);
  }
}

async function fetchPreview(cardId) {
  const imageUrl = `${BACKEND_BASE_URL}/api/card-images/${encodeURIComponent(cardId)}/image`;
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 20000,
    validateStatus: () => true,
  });

  if (response.status !== 200 || !response.data || response.data.byteLength === 0) {
    const payloadText = response.data ? Buffer.from(response.data).toString('utf8').slice(0, 500) : 'no payload';
    throw new Error(`Image fetch failed. status=${response.status}, payload=${payloadText}`);
  }

  const buffer = Buffer.from(response.data);
  const metadata = await sharp(buffer).metadata();

  const outDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const fileName = `print-preview-${cardId}.png`;
  const outputPath = path.join(outDir, fileName);
  fs.writeFileSync(outputPath, buffer);

  return {
    imageUrl,
    outputPath,
    bytes: buffer.byteLength,
    width: metadata.width || null,
    height: metadata.height || null,
    format: metadata.format || null,
  };
}

(async () => {
  try {
    await checkBackendHealth();

    const card = await getLatestApprovedCard();
    if (!card) {
      throw new Error('No approved card record found in database.');
    }

    const result = await fetchPreview(card.id);

    console.log('PRINT_FETCH_PREVIEW_OK');
    console.log(JSON.stringify({
      card,
      ...result,
    }, null, 2));
  } catch (error) {
    console.error('PRINT_FETCH_PREVIEW_ERROR');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (pool && typeof pool.end === 'function') {
      await pool.end().catch(() => {});
    }
  }
})();
