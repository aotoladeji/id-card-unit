// Run: node backend/test-card-svg-layout.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { applyCardLayoutCorrection } = require('./services/cardSvgLayout');

const svg = fs.readFileSync(path.join(__dirname, '..', 'tmp', 'output-5.svg'), 'utf8');
const out = applyCardLayoutCorrection(svg);
const pos = (s) => [...s.matchAll(/<text\b[^>]*\sx="([^"]+)"[^>]*\sy="([^"]+)"[^>]*>([^<]*)/g)]
  .map((m) => `${m[3]} @ ${m[1]},${m[2]}`);

console.log('BEFORE\n ' + pos(svg).join('\n '));
console.log('AFTER\n ' + pos(out).join('\n '));

assert.notStrictEqual(out, svg, 'layout should change');
assert.strictEqual(applyCardLayoutCorrection(out), out, 'must be idempotent');
assert.strictEqual(out.length > svg.length - 200, true);
// photo, signature and barcode must be untouched
for (const needle of ['x="246" y="88"', 'x="246" y="186"', 'translate(144, 192)']) {
  assert(out.includes(needle), needle + ' changed');
}
console.log('\nOK: corrected, idempotent, non-text elements untouched');
