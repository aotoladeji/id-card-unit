/**
 * TEMPORARY: upload several photos and see how the card framing treats them.
 *
 *   Enable:  ENABLE_PHOTO_TEST=true   (route is not mounted otherwise)
 *   Open:    <backend-url>/api/photo-test
 *   Remove:  unset ENABLE_PHOTO_TEST (or delete this file + its app.use line)
 *
 * Nothing is saved: each image is processed in memory and sent straight back.
 */
const express = require('express');
const { frameBuffer } = require('../services/passportFraming');

const router = express.Router();

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo framing test</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #f4f5f7; color: #222; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.hint { margin: 0 0 16px; color: #666; font-size: 14px; }
  .bar { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; background: #fff; padding: 14px 16px; border-radius: 10px; margin-bottom: 18px; }
  .bar label { font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
  .bar input[type=range] { width: 200px; }
  code { background: #eef0f3; padding: 3px 8px; border-radius: 6px; font-size: 13px; }
  #grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
  .card { background: #fff; border-radius: 10px; padding: 12px; }
  .name { font-size: 12px; color: #666; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pair { display: flex; gap: 10px; align-items: flex-start; }
  .pair figure { margin: 0; flex: 1; text-align: center; }
  figcaption { font-size: 11px; color: #888; margin-top: 4px; }
  .orig, .frame { width: 100%; aspect-ratio: 78 / 96; border: 1px solid #ddd; background: #fafafa; position: relative; overflow: hidden; }
  .orig img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .frame img { width: 100%; height: 100%; display: block; }
  .chin { position: absolute; left: 0; right: 0; border-top: 1px dashed red; pointer-events: none; }
  .status { font-size: 12px; margin-top: 8px; }
  .ok { color: #1a7f37; } .warn { color: #b45309; } .err { color: #b00020; }
</style>
</head>
<body>
  <h1>Photo framing test</h1>
  <p class="hint">Choose several photos. Left is the original, right is how the card will frame it. The red dashed line is where the chin should sit.</p>

  <div class="bar">
    <input id="files" type="file" accept="image/*" multiple>
    <label>Face size: <b id="ratioVal">0.50</b>
      <input id="ratio" type="range" min="0.30" max="0.70" step="0.01" value="0.50">
    </label>
    <label>Chin position: <b id="chinVal">0.71</b>
      <input id="chin" type="range" min="0.50" max="0.90" step="0.01" value="0.71">
    </label>
    <div>Env values: <code id="envOut"></code></div>
  </div>

  <div id="grid"></div>

<script>
const grid = document.getElementById('grid');
const ratio = document.getElementById('ratio');
const chin = document.getElementById('chin');
const items = [];

const fmt = (n) => Number(n).toFixed(2);
function updateLabels() {
  document.getElementById('ratioVal').textContent = fmt(ratio.value);
  document.getElementById('chinVal').textContent = fmt(chin.value);
  document.getElementById('envOut').textContent =
    'CARD_PHOTO_FACE_RATIO=' + fmt(ratio.value) + '  CARD_PHOTO_CHIN_POS=' + fmt(chin.value);
  document.querySelectorAll('.chin').forEach((el) => { el.style.top = (chin.value * 100) + '%'; });
}

function makeCard(file) {
  const el = document.createElement('div');
  el.className = 'card';
  const origUrl = URL.createObjectURL(file);
  el.innerHTML =
    '<div class="name"></div>' +
    '<div class="pair">' +
      '<figure><div class="orig"><img src="' + origUrl + '"></div><figcaption>Original</figcaption></figure>' +
      '<figure><div class="frame"><img alt=""><div class="chin"></div></div><figcaption>Card framing</figcaption></figure>' +
    '</div><div class="status">Working...</div>';
  el.querySelector('.name').textContent = file.name;
  grid.appendChild(el);
  return { file, el, token: 0 };
}

async function process(item) {
  const token = ++item.token;
  const status = item.el.querySelector('.status');
  const img = item.el.querySelector('.frame img');
  status.className = 'status'; status.textContent = 'Working...';
  try {
    const res = await fetch('/api/photo-test/frame?ratio=' + ratio.value + '&chin=' + chin.value, {
      method: 'POST',
      headers: { 'Content-Type': item.file.type || 'image/jpeg' },
      body: item.file
    });
    if (token !== item.token) return;               // a newer run replaced this one
    if (res.status === 422) {
      img.removeAttribute('src');
      status.className = 'status warn';
      status.textContent = 'No face found. The card would use this photo unchanged.';
      return;
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || ('HTTP ' + res.status));
    const blob = await res.blob();
    if (token !== item.token) return;
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.dataset.url = URL.createObjectURL(blob);
    img.src = img.dataset.url;
    status.className = 'status ok';
    status.textContent = 'Framed';
  } catch (error) {
    status.className = 'status err';
    status.textContent = 'Failed: ' + error.message;
  }
}

async function runAll() {
  // two at a time so the server is not flooded
  const queue = items.slice();
  const worker = async () => { while (queue.length) await process(queue.shift()); };
  await Promise.all([worker(), worker()]);
}

document.getElementById('files').addEventListener('change', (event) => {
  for (const file of event.target.files) items.push(makeCard(file));
  event.target.value = '';
  updateLabels();
  runAll();
});

let timer = null;
[ratio, chin].forEach((input) => input.addEventListener('input', () => {
  updateLabels();
  clearTimeout(timer);
  timer = setTimeout(runAll, 350);
}));

updateLabels();
</script>
</body>
</html>`;

router.get('/', (req, res) => {
  res.type('html').send(PAGE);
});

router.post('/frame', express.raw({ type: 'image/*', limit: '25mb' }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'No image received' });
    }

    const faceRatio = Number(req.query.ratio);
    const chinPos = Number(req.query.chin);
    const framed = await frameBuffer(req.body, 78, 96, {
      faceRatio: faceRatio >= 0.2 && faceRatio <= 0.9 ? faceRatio : undefined,
      chinPos: chinPos >= 0.3 && chinPos <= 0.95 ? chinPos : undefined
    });

    if (!framed) return res.status(422).json({ error: 'No face found' });

    res.set('Cache-Control', 'no-store');
    return res.type(framed.mime).send(framed.buffer);
  } catch (error) {
    return res.status(400).json({ error: `Could not process this image (${error.message})` });
  }
});

module.exports = router;