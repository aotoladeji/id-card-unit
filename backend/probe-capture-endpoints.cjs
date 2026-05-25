const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const base = process.env.CAPTURE_APP_URL || 'http://localhost:5001';
const cardId = process.argv[2] || '5';

async function probe() {
  const endpoints = [
    `/api/idcard/${cardId}`,
    `/api/printing/output-image?cardId=${encodeURIComponent(cardId)}`,
    `/api/printing/output-svg?cardId=${encodeURIComponent(cardId)}`,
    '/api/printing/output',
  ];

  for (const endpoint of endpoints) {
    const url = `${base}${endpoint}`;
    try {
      const isSvg = endpoint.includes('/output-svg');
      const isOutputList = endpoint.endsWith('/output');

      const response = await axios.get(url, {
        timeout: 12000,
        responseType: isSvg ? 'text' : 'arraybuffer',
        validateStatus: () => true,
      });

      const contentType = response.headers['content-type'] || '';
      const length = isOutputList
        ? JSON.stringify(response.data || {}).length
        : response.data?.byteLength || String(response.data || '').length;

      console.log(`${endpoint} -> status=${response.status} len=${length} type=${contentType}`);

      if (isSvg && response.status === 200) {
        const text = String(response.data || '');
        console.log(`  svg_has_text_tag=${text.includes('<text')}`);
      }

      if (isOutputList && response.status === 200) {
        const files = response.data?.files || response.data?.data || response.data?.output || [];
        console.log(`  output_entries=${Array.isArray(files) ? files.length : 0}`);
      }
    } catch (error) {
      console.log(`${endpoint} -> error=${error.code || error.message}`);
    }
  }
}

probe();
