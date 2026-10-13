/**
 * Card SVG layout correction
 * --------------------------
 * The capture app renders every approved card's printable SVG (336 x 212 user
 * units, ~0.7229 pt per unit) with the text block sitting ~13 pt too high and
 * ~3.5 pt too far left compared with the reference card that prints perfectly
 * on the physical stock.
 *
 * The SVG is generated on demand by the capture app (/api/printing/output-svg),
 * so correcting it here, at the moment we fetch it, fixes ALL cards, including
 * every card that was already approved/captured, with no data migration.
 *
 * The correction is idempotent: only text elements still sitting at the old
 * (legacy) coordinates are moved. If the capture app is later fixed at the
 * source, its output no longer matches and passes through untouched.
 *
 * Measured targets (units, baseline of each line):
 *   ID/Matric 73.5 | Surname 92 | Other names 111 | Faculty 129
 *   Department 146 | Level 166 | Hall 182.5 | Card no (7.3, 204.5)
 *   Session (329, 92.5)   text left edge x = 74.7
 *
 * Fine tuning after a test print (units; 1 mm is about 3.92 units):
 *   CARD_SVG_NUDGE_X, CARD_SVG_NUDGE_Y   shift every corrected text element
 *   CARD_SVG_LAYOUT_FIX=false             turn the correction off entirely
 */

const TEXT_LEFT = 74.7;

// legacy "x,y" emitted by the capture app  ->  corrected [x, y]
const LEGACY_TO_CORRECTED = [
  { from: [70, 56], to: [TEXT_LEFT, 73.5] },   // matric / staff id
  { from: [70, 74], to: [TEXT_LEFT, 92] },     // surname
  { from: [70, 92], to: [TEXT_LEFT, 111] },    // other names
  { from: [70, 110], to: [TEXT_LEFT, 129] },   // faculty
  { from: [70, 128], to: [TEXT_LEFT, 146] },   // department
  { from: [70, 146], to: [TEXT_LEFT, 166] },   // level
  { from: [70, 164], to: [TEXT_LEFT, 182.5] }, // hall
  { from: [10, 200], to: [7.3, 204.5] },       // card number
  { from: [330, 95], to: [329, 92.5] }         // session (vertical, right edge)
];

const EPSILON = 0.01;

const readNumberEnv = (name) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : 0;
};

const getAttr = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`));
  return match ? { raw: match[0], value: match[2], quote: match[1] } : null;
};

const setAttr = (tag, name, value) => {
  const attr = getAttr(tag, name);
  if (!attr) return tag;
  return tag.replace(attr.raw, ` ${name}=${attr.quote}${value}${attr.quote}`);
};

const round = (n) => Math.round(n * 100) / 100;

/**
 * @param {string} svgText raw SVG returned by the capture app
 * @returns {string} SVG with the text layout corrected
 */
const applyCardLayoutCorrection = (svgText) => {
  if (typeof svgText !== 'string' || !svgText.includes('<text')) return svgText;
  if (String(process.env.CARD_SVG_LAYOUT_FIX).toLowerCase() === 'false') return svgText;

  const nudgeX = readNumberEnv('CARD_SVG_NUDGE_X');
  const nudgeY = readNumberEnv('CARD_SVG_NUDGE_Y');

  return svgText.replace(/<text\b[^>]*>/g, (tag) => {
    const xAttr = getAttr(tag, 'x');
    const yAttr = getAttr(tag, 'y');
    if (!xAttr || !yAttr) return tag;

    const x = parseFloat(xAttr.value);
    const y = parseFloat(yAttr.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return tag;

    const rule = LEGACY_TO_CORRECTED.find(
      ({ from }) => Math.abs(from[0] - x) < EPSILON && Math.abs(from[1] - y) < EPSILON
    );
    if (!rule) return tag;

    let corrected = setAttr(tag, 'x', round(rule.to[0] + nudgeX));
    corrected = setAttr(corrected, 'y', round(rule.to[1] + nudgeY));
    return corrected;
  });
};

module.exports = { applyCardLayoutCorrection, LEGACY_TO_CORRECTED };
