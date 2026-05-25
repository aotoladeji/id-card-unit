const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pool = require('./config/database');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const base = process.env.CAPTURE_APP_URL || 'http://localhost:5001';
const cardId = process.argv[2] || '5';

async function getCard() {
  const sql = `SELECT card_id, surname, other_names, matric_no, faculty, department, level, session, card_number
               FROM approved_cards
               WHERE card_id = $1
               ORDER BY id DESC
               LIMIT 1`;
  const result = await pool.query(sql, [cardId]);
  return result.rows[0] || null;
}

(async () => {
  try {
    const response = await axios.get(`${base}/api/printing/output-svg?cardId=${encodeURIComponent(cardId)}`, {
      responseType: 'text',
      timeout: 15000,
      validateStatus: () => true,
    });

    console.log('status', response.status);
    const svgText = String(response.data || '');
    const out = path.join(__dirname, '..', 'tmp', `output-${cardId}.svg`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, svgText, 'utf8');

    const card = await getCard();
    const checks = card
      ? {
          surname: card.surname,
          other_names: card.other_names,
          matric_no: card.matric_no,
          faculty: card.faculty,
          department: card.department,
          level: card.level,
          session: card.session,
          card_number: card.card_number,
        }
      : {};

    console.log('svg_length', svgText.length);
    console.log('contains_text_tag', svgText.includes('<text'));
    console.log('contains_foreignObject', svgText.includes('foreignObject'));
    for (const [key, value] of Object.entries(checks)) {
      const val = String(value || '');
      if (!val) continue;
      console.log(`contains_${key}`, svgText.includes(val));
    }
    console.log('saved_svg', out);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
