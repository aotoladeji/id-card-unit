/**
 * Passport photo framing
 * Gives every card photo the same head-to-shoulder framing, regardless of how
 * close or far the person was when the picture was captured:
 *   - the face is detected (pico.js, pure JS, no native/ML runtime),
 *   - the photo is re-cropped so the face is always the same size and the chin
 *     always sits at the same height; zoomed in when the capture was far,
 *     zoomed out (padded with the photo's own background) when it was too close.
 *
 * Runs on the SVG the capture app returns, so already-approved cards are
 * re-framed automatically. If no face is found (or anything fails) the
 * original photo is left untouched.
 *
 * Needs:  npm i picojs          (sharp and axios are already dependencies)
 * Model:  loaded from CARD_FACEFINDER_PATH, backend/vendor/facefinder, or
 *         <tmpdir>/facefinder; downloaded once from GitHub if none exists.
 *
 * Env (all optional):
 *   CARD_PHOTO_FRAMING=false     turn this off
 *   CARD_PHOTO_FACE_RATIO=0.5    face height as a fraction of the photo height
 *                                (bigger = more zoomed in)
 *   CARD_PHOTO_CHIN_POS=0.71     where the chin sits, 0 = top ... 1 = bottom
 *   CARD_FACEFINDER_PATH / CARD_FACEFINDER_URL
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

let pico = null;
try {
  pico = require('picojs');
} catch (error) {
  console.warn('passportFraming: "picojs" is not installed (npm i picojs); photo framing disabled.');
}

const FACEFINDER_URL = process.env.CARD_FACEFINDER_URL
  || 'https://raw.githubusercontent.com/nenadmarkus/pico/master/rnt/cascades/facefinder';

const numberEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const OUTPUT_SCALE = 6;          // output pixels per SVG unit (78x96 -> 468x576)
const MAX_DETECT_SIDE = 640;     // detection runs on a downscaled copy
const CACHE_LIMIT = 200;

// ---------------------------------------------------------------- model ----

let facefinderPromise = null;
let facefinderFailedAt = 0;

const loadFacefinder = async () => {
  const candidates = [
    process.env.CARD_FACEFINDER_PATH,
    path.join(__dirname, '..', 'vendor', 'facefinder'),
    path.join(os.tmpdir(), 'facefinder')
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      const bytes = fs.readFileSync(file);
      if (bytes.length > 1000) return pico.unpack_cascade(new Int8Array(bytes));
    } catch (error) { /* try next */ }
  }

  const response = await axios.get(FACEFINDER_URL, { responseType: 'arraybuffer', timeout: 20000 });
  const bytes = Buffer.from(response.data);
  try { fs.writeFileSync(path.join(os.tmpdir(), 'facefinder'), bytes); } catch (error) { /* cache only */ }
  return pico.unpack_cascade(new Int8Array(bytes));
};

const getFacefinder = () => {
  if (!pico) return Promise.resolve(null);
  // after a failed download, wait 10 minutes before trying again
  if (!facefinderPromise && Date.now() - facefinderFailedAt > 10 * 60 * 1000) {
    facefinderPromise = loadFacefinder().catch((error) => {
      console.warn(`passportFraming: could not load face model (${error.message}); photos left as-is.`);
      facefinderFailedAt = Date.now();
      facefinderPromise = null;
      return null;
    });
  }
  return facefinderPromise || Promise.resolve(null);
};

// ------------------------------------------------------------ detection ----

const detectFace = async (orientedBuffer, facefinder) => {
  const meta = await sharp(orientedBuffer).metadata();
  const scale = Math.min(1, MAX_DETECT_SIDE / Math.max(meta.width, meta.height));
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));

  const gray = await sharp(orientedBuffer)
    .flatten({ background: '#ffffff' })
    .resize(width, height)
    .greyscale()
    .raw()
    .toBuffer();

  const image = { pixels: new Uint8Array(gray), nrows: height, ncols: width, ldim: width };
  const shortSide = Math.min(width, height);

  let best = null;
  for (const minFraction of [0.15, 0.3]) {
    let dets = pico.run_cascade(image, facefinder, {
      shiftfactor: 0.1,
      scalefactor: 1.07,
      minsize: Math.max(20, Math.round(shortSide * minFraction)),
      maxsize: Math.max(width, height)
    });
    dets = pico.cluster_detections(dets, 0.2);
    for (const [row, col, size, quality] of dets) {
      if (quality < 4) continue;
      if (!best || quality > best.quality) best = { row, col, size, quality };
    }
    if (best && best.quality >= 8) break;
  }
  if (!best) return null;

  // back to full-resolution coordinates
  return { row: best.row / scale, col: best.col / scale, size: best.size / scale, meta };
};

// --------------------------------------------------------------- framing ----

const estimateBackground = async (orientedBuffer) => {
  const { data } = await sharp(orientedBuffer)
    .flatten({ background: '#ffffff' })
    .resize(16, 16, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x, y) => [data[(y * 16 + x) * 3], data[(y * 16 + x) * 3 + 1], data[(y * 16 + x) * 3 + 2]];
  const a = px(0, 0);
  const b = px(15, 0);
  return { r: Math.round((a[0] + b[0]) / 2), g: Math.round((a[1] + b[1]) / 2), b: Math.round((a[2] + b[2]) / 2) };
};

// was: const frameBuffer = async (inputBuffer, frameWidth, frameHeight) => {
const frameBuffer = async (inputBuffer, frameWidth, frameHeight, options = {}) => {
  const facefinder = await getFacefinder();
  if (!facefinder) return null;

  const oriented = await sharp(inputBuffer).rotate().toBuffer(); // honour EXIF orientation
  const face = await detectFace(oriented, facefinder);
  if (!face) return null;

  const { meta } = face;
  const shortSide = Math.min(meta.width, meta.height);
  if (face.size < shortSide * 0.12) return null;                     // implausibly small hit
  if (face.col < 0 || face.col > meta.width || face.row < 0 || face.row > meta.height) return null;

  // was: const faceRatio = numberEnv('CARD_PHOTO_FACE_RATIO', 0.5);
  const faceRatio = options.faceRatio || numberEnv('CARD_PHOTO_FACE_RATIO', 0.5);
  // was: const chinPos = numberEnv('CARD_PHOTO_CHIN_POS', 0.71);
const chinPos = options.chinPos || numberEnv('CARD_PHOTO_CHIN_POS', 0.71);

  // crop window in source pixels (may run past the image edges)
  const windowHeight = face.size / faceRatio;
  const windowWidth = windowHeight * (frameWidth / frameHeight);
  const chinY = face.row + face.size / 2;                             // bottom of the face box
  const top = chinY - chinPos * windowHeight;
  const left = face.col - windowWidth / 2;

  const outWidth = Math.round(frameWidth * OUTPUT_SCALE);
  const outHeight = Math.round(frameHeight * OUTPUT_SCALE);
  const zoom = outWidth / windowWidth;

  const scaledWidth = Math.max(1, Math.round(meta.width * zoom));
  const scaledHeight = Math.max(1, Math.round(meta.height * zoom));
  const L = Math.round(left * zoom);
  const T = Math.round(top * zoom);

  // part of the scaled photo that falls inside the frame, and the padding around it
  const srcLeft = Math.max(0, L);
  const srcTop = Math.max(0, T);
  const extractWidth = Math.min(L + outWidth, scaledWidth) - srcLeft;
  const extractHeight = Math.min(T + outHeight, scaledHeight) - srcTop;
  if (extractWidth < 8 || extractHeight < 8) return null;             // window misses the image

  const padLeft = Math.max(0, -L);
  const padTop = Math.max(0, -T);
  const padRight = Math.max(0, outWidth - padLeft - extractWidth);
  const padBottom = Math.max(0, outHeight - padTop - extractHeight);

  const hasAlpha = Boolean(meta.hasAlpha);
  const background = hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : await estimateBackground(oriented);

  // stage 1: zoom the whole photo; stage 2: cut the window and pad what is missing
  const zoomed = await sharp(oriented)
    .resize(scaledWidth, scaledHeight, { kernel: 'lanczos3' })
    .toBuffer();

  let pipeline = sharp(zoomed)
    .extract({ left: srcLeft, top: srcTop, width: extractWidth, height: extractHeight })
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background })
    .resize(outWidth, outHeight, { fit: 'fill' });                    // absorbs 1px rounding

  pipeline = hasAlpha ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 92 });
  const buffer = await pipeline.toBuffer();
  return { buffer, mime: hasAlpha ? 'image/png' : 'image/jpeg' };
};

// ------------------------------------------------------------ SVG hookup ----

const cache = new Map(); // key -> data URI (or null when nothing to change)

const remember = (key, value) => {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
};

const attrOf = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`));
  return match ? match[2] : null;
};

const HREF_PATTERN = /(\s(?:xlink:)?href\s*=\s*)(["'])(data:image\/[a-z+.-]+;base64,)([A-Za-z0-9+/=\s]+)\2/;

const normalizePassportFraming = async (svgText) => {
  if (!pico || typeof svgText !== 'string' || !svgText.includes('<image')) return svgText;
  if (String(process.env.CARD_PHOTO_FRAMING).toLowerCase() === 'false') return svgText;

  const tags = svgText.match(/<image\b[^>]*>/g) || [];
  let result = svgText;

  for (const tag of tags) {
    const width = parseFloat(attrOf(tag, 'width'));
    const height = parseFloat(attrOf(tag, 'height'));
    // passport box is 78 x 96 units (the signature box is 78 x 22)
    if (!(Math.abs(width - 78) < 0.5 && Math.abs(height - 96) < 0.5)) continue;

    const hrefMatch = tag.match(HREF_PATTERN);
    if (!hrefMatch) continue;

    const key = crypto
      .createHash('sha1')
      .update(hrefMatch[4])
      .update(`${process.env.CARD_PHOTO_FACE_RATIO || ''}|${process.env.CARD_PHOTO_CHIN_POS || ''}`)
      .digest('hex');

    let dataUri = cache.get(key);
    if (dataUri === undefined) {
      try {
        const input = Buffer.from(hrefMatch[4].replace(/\s+/g, ''), 'base64');
        const framed = await frameBuffer(input, width, height);
        dataUri = framed ? `data:${framed.mime};base64,${framed.buffer.toString('base64')}` : null;
      } catch (error) {
        console.warn(`passportFraming: ${error.message}; photo left as-is.`);
        dataUri = null;
      }
      remember(key, dataUri);
    }

    if (dataUri) {
      const newTag = tag.replace(HREF_PATTERN, `$1$2${dataUri}$2`);
      result = result.replace(tag, () => newTag);
    }
  }
  return result;
};

module.exports = { normalizePassportFraming, frameBuffer };