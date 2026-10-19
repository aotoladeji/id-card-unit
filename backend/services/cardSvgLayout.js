/**
 * Card SVG layout correction
 * Moves the text to match the reference card, applies bold Times, and flips
 * the session to run bottom-to-top along the right edge.
 * Runs on every SVG fetched from the capture app, so it fixes already-approved
 * cards too. Idempotent: only text still at the old coordinates is touched.
 *
 * Env (all optional):
 *   CARD_SVG_NUDGE_X, CARD_SVG_NUDGE_Y   shift corrected text (units; 1mm ~ 3.92)
 *   CARD_SVG_LAYOUT_FIX=false            turn the whole correction off
 *   CARD_SVG_FONT_FIX=false              move text only, keep the original font
 *   CARD_SVG_BOLD_CARD_NUMBER=true       make the card number bold too
 */

const TEXT_LEFT = 70;
const FONT_FAMILY = "'Times New Roman', Times, 'Liberation Serif', serif";
const MAX_TEXT_WIDTH = 155; // space between text column and photo
const MIN_FONT_SIZE = 6;

const LEGACY_TO_CORRECTED = [
  { field: 'id',         from: [70, 56],   to: [TEXT_LEFT, 72],    size: 16.6, bold: true, fit: true },
  { field: 'surname',    from: [70, 74],   to: [TEXT_LEFT, 90.5],  size: 15.2, bold: true, fit: true },
  { field: 'otherNames', from: [70, 92],   to: [TEXT_LEFT, 109.5], size: 15.2, bold: true, fit: true },
  { field: 'faculty',    from: [70, 110],  to: [TEXT_LEFT, 127.5], size: 15.2, bold: true, fit: true },
  { field: 'department', from: [70, 128],  to: [TEXT_LEFT, 144.5], size: 15.2, bold: true, fit: true },
  { field: 'level',      from: [70, 146],  to: [TEXT_LEFT, 164.5], size: 16.6, bold: true, fit: true },
  { field: 'hall',       from: [70, 164],  to: [TEXT_LEFT, 181],   size: 16.6, bold: true, fit: true },
  { field: 'cardNumber', from: [10, 200],  to: [7.2, 204.5],       size: 11.1, bold: false, fit: false },
  // Session: runs bottom-to-top along the right edge (glyph tops face left).
  // x = text baseline, y = where the text starts (bottom end).
  { field: 'session',    from: [330, 95],  to: [329.5, 173],       size: 12.45, bold: true, fit: false, rotate: -90 }
];

// Passport photo + signature box: the capture app puts them at x=246 (width 78),
// so their right edge (324) runs into the session text. Shift both left.
const LEGACY_IMAGES = [[246, 88], [246, 186]]; // [x, y] of passport, signature
const IMAGE_SHIFT_X = -12;                     // units (~3 mm)

const EPSILON = 0.01;

// Times New Roman Bold advance widths (per 1000 em), for fit-to-width
const W = { ' ': 250, '&': 833, '-': 333, '/': 278, '.': 250, ',': 250, '(': 333, ')': 333, "'": 278,
  A: 722, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 778, I: 389, J: 500, K: 778, L: 667, M: 944,
  N: 722, O: 778, P: 611, Q: 778, R: 722, S: 556, T: 667, U: 722, V: 722, W: 1000, X: 722, Y: 722, Z: 667,
  a: 500, b: 556, c: 444, d: 556, e: 444, f: 333, g: 500, h: 556, i: 278, j: 333, k: 556, l: 278, m: 833,
  n: 556, o: 500, p: 556, q: 556, r: 444, s: 389, t: 333, u: 556, v: 500, w: 722, x: 500, y: 500, z: 444 };

const unescapeXml = (s) => s.replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

const textWidthEm = (text) => {
  let total = 0;
  for (const ch of text) total += /[0-9]/.test(ch) ? 500 : (W[ch] || 550);
  return total / 1000;
};

const readNumberEnv = (name) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : 0;
};
const envIs = (name, expected) => String(process.env[name]).toLowerCase() === expected;

const getAttr = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`));
  return match ? { raw: match[0], value: match[2], quote: match[1] } : null;
};

const setAttr = (tag, name, value) => {
  const attr = getAttr(tag, name);
  if (!attr) return tag;
  return tag.replace(attr.raw, ` ${name}=${attr.quote}${value}${attr.quote}`);
};

// inline style wins over the capture app's `.label { font-family: Arial }` rule
const mergeStyle = (tag, css) => {
  const attr = getAttr(tag, 'style');
  if (attr) return tag.replace(attr.raw, ` style="${attr.value.replace(/;?\s*$/, ';')}${css}"`);
  return tag.replace(/^<text\b/, `<text style="${css}"`);
};

const round = (n) => Math.round(n * 100) / 100;

const applyCardLayoutCorrection = (svgText) => {
  if (typeof svgText !== 'string' || !svgText.includes('<text')) return svgText;
  if (envIs('CARD_SVG_LAYOUT_FIX', 'false')) return svgText;

  const nudgeX = readNumberEnv('CARD_SVG_NUDGE_X');
  const nudgeY = readNumberEnv('CARD_SVG_NUDGE_Y');
  const fixFont = !envIs('CARD_SVG_FONT_FIX', 'false');
  const boldCardNumber = envIs('CARD_SVG_BOLD_CARD_NUMBER', 'true');

  const photoNudge = readNumberEnv('CARD_SVG_PHOTO_NUDGE_X');

  const textFixed = svgText.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, (element) => {
    const tagEnd = element.indexOf('>') + 1;
    let tag = element.slice(0, tagEnd);
    const rest = element.slice(tagEnd);

    const xAttr = getAttr(tag, 'x');
    const yAttr = getAttr(tag, 'y');
    if (!xAttr || !yAttr) return element;

    const x = parseFloat(xAttr.value);
    const y = parseFloat(yAttr.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return element;

    const rule = LEGACY_TO_CORRECTED.find(
      ({ from }) => Math.abs(from[0] - x) < EPSILON && Math.abs(from[1] - y) < EPSILON
    );
    if (!rule) return element;

    const newX = round(rule.to[0] + nudgeX);
    const newY = round(rule.to[1] + nudgeY);
    tag = setAttr(tag, 'x', newX);
    tag = setAttr(tag, 'y', newY);

    if (rule.rotate) {
      // drop the capture app's vertical-rl (reads top-to-bottom) and rotate instead
      tag = tag.replace(/\swriting-mode\s*=\s*(["'])[^"']*\1/, '');
      tag = tag.replace(/\stransform\s*=\s*(["'])[^"']*\1/, '');
      tag = tag.replace(/^<text\b/, `<text transform="rotate(${rule.rotate} ${newX} ${newY})"`);
    }

    if (fixFont) {
      let size = rule.size;
      if (rule.fit) {
        const text = unescapeXml(rest.replace(/<\/text>$/, ''));
        const em = textWidthEm(text);
        if (em > 0) size = Math.max(MIN_FONT_SIZE, Math.min(size, MAX_TEXT_WIDTH / em));
      }
      const bold = rule.bold || (rule.field === 'cardNumber' && boldCardNumber);
      tag = setAttr(tag, 'font-size', `${round(size)}px`);
      tag = mergeStyle(tag, `font-family:${FONT_FAMILY};font-weight:${bold ? 'bold' : 'normal'};`);
    }
    return tag + rest;
  });

  // move passport photo + signature clear of the session text
  return textFixed.replace(/<image\b[^>]*>/g, (tag) => {
    const xAttr = getAttr(tag, 'x');
    const yAttr = getAttr(tag, 'y');
    if (!xAttr || !yAttr) return tag;
    const x = parseFloat(xAttr.value);
    const y = parseFloat(yAttr.value);
    const match = LEGACY_IMAGES.some(
      ([lx, ly]) => Math.abs(lx - x) < EPSILON && Math.abs(ly - y) < EPSILON
    );
    return match ? setAttr(tag, 'x', round(x + IMAGE_SHIFT_X + photoNudge)) : tag;
  });
};
module.exports = { applyCardLayoutCorrection, LEGACY_TO_CORRECTED, textWidthEm };