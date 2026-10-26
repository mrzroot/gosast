// Unit tests for the tearing geometry and physics. Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

test('grid covers the whole area, rounding cells up at the edges', () => {
  const g = C.makeGrid(100, 50);
  assert.equal(g.cols, Math.ceil(100 / C.CELL));
  assert.equal(g.rows, Math.ceil(50 / C.CELL));
  assert.equal(g.cut.length, g.cols * g.rows);
  assert.equal(C.uncutCount(g), g.cols * g.rows);
});

test('the last cell is clipped to the page edge, not the full cell size', () => {
  const g = C.makeGrid(100, 50);
  const r = C.cellRect(g, g.cols - 1, g.rows - 1, g.cols - 1, g.rows - 1);
  assert.equal(r.x + r.w, 100);
  assert.equal(r.y + r.h, 50);
});

test('a circle selects only cells it actually touches', () => {
  const g = C.makeGrid(140, 140);
  const hit = C.cellsInCircle(g, 70, 70, 5);
  assert.ok(hit.length >= 1 && hit.length <= 4, 'tiny brush hits at most the 4 cells around the centre');
  assert.ok(C.cellsInCircle(g, 70, 70, 60).length > hit.length);
  assert.deepEqual(C.cellsInCircle(g, -500, -500, 10), [], 'a brush far outside hits nothing');
});

test('a swept segment returns each cell once', () => {
  const g = C.makeGrid(280, 140);
  const hit = C.cellsAlongSegment(g, 10, 70, 270, 70, 10);
  assert.equal(new Set(hit).size, hit.length);
  assert.ok(hit.length > C.cellsInCircle(g, 10, 70, 10).length);
});

test('confetti mode makes one piece per cell and marks the cells cut', () => {
  const g = C.makeGrid(140, 140);
  const cells = C.cellsInCircle(g, 70, 70, 20);
  const pieces = C.extractPieces(g, cells, 'confetti');
  assert.equal(pieces.length, cells.length);
  assert.equal(C.uncutCount(g), g.cols * g.rows - cells.length);
  assert.equal(C.extractPieces(g, cells, 'confetti').length, 0, 'already-cut cells are not cut twice');
});

test('strip mode pulls out whole tall runs within a block', () => {
  const g = C.makeGrid(140, 400);
  const pieces = C.extractPieces(g, [3 * g.cols + 2], 'strip');   // one cell in column 2, row 3
  assert.equal(pieces.length, 1);
  const p = pieces[0];
  assert.equal(p.w, C.CELL);
  assert.equal(p.h, C.CELL * C.STRIP_ROWS);
  assert.equal(p.cells.length, C.STRIP_ROWS);
});

test('strip mode splits around cells that were already cut', () => {
  const g = C.makeGrid(140, 400);
  C.extractPieces(g, [3 * g.cols + 2], 'confetti');                // remove one cell from the middle of the run
  const pieces = C.extractPieces(g, [0 * g.cols + 2], 'strip');
  assert.equal(pieces.length, 1, 'rows 0-2 form a run above the gap');
  assert.equal(pieces[0].cells.length, 3);
  const below = C.extractPieces(g, [5 * g.cols + 2], 'strip');
  assert.equal(below.length, 1, 'rows 4-7 form a run below the gap');
  assert.equal(below[0].cells.length, 4);
});

test('a piece remembers exactly where it came from', () => {
  const g = C.makeGrid(140, 140);
  const [p] = C.extractPieces(g, [2 * g.cols + 3], 'confetti');
  assert.equal(p.hx, 3 * C.CELL + C.CELL / 2);
  assert.equal(p.hy, 2 * C.CELL + C.CELL / 2);
  assert.equal(p.sx, 3 * C.CELL);
  assert.equal(p.sy, 2 * C.CELL);
});

test('restoreCells puts every cell back on the sheet', () => {
  const g = C.makeGrid(140, 400);
  const pieces = C.extractPieces(g, C.cellsInCircle(g, 70, 100, 40), 'strip');
  assert.ok(C.uncutCount(g) < g.cols * g.rows);
  pieces.forEach((p) => C.restoreCells(g, p));
  assert.equal(C.uncutCount(g), g.cols * g.rows);
});

test('extents of a rotated rectangle swap width and height at 90 degrees', () => {
  const a = C.extents(14, 112, 0), b = C.extents(14, 112, Math.PI / 2);
  assert.ok(Math.abs(a.hw - 7) < 1e-9 && Math.abs(a.hh - 56) < 1e-9);
  assert.ok(Math.abs(b.hw - 56) < 1e-9 && Math.abs(b.hh - 7) < 1e-9);
});

test('flatAngle snaps to a multiple of 90 degrees', () => {
  assert.equal(C.flatAngle(0.2), 0);
  assert.ok(Math.abs(C.flatAngle(1.4) - Math.PI / 2) < 1e-9);
});

/** Run the physics until nothing is falling or the time budget runs out. */
function simulate(pieces, ctx, seconds) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 120) {
    for (const p of pieces) { const ev = C.stepPiece(p, 1 / 120, ctx); if (ev) events.push([p, ev]); }
  }
  return events;
}

test('a dropped piece lands on the floor and rests', () => {
  const W = 300, H = 400, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const [p] = C.extractPieces(g, [2 * g.cols + 5], 'confetti');
  const ctx = { W, H, field, gentle: false };
  const ev = simulate([p], ctx, 4);
  assert.equal(p.state, 'rest');
  assert.ok(ev.some(([, e]) => e === 'landed'));
  const e = C.extents(p.w, p.h, p.ang);
  assert.ok(Math.abs(p.y + e.hh - H) < 0.5, 'bottom edge sits on the floor');
  assert.ok(C.pileHeight(field, 0, W) > 0, 'the pile height map recorded it');
});

test('pieces stack on each other and never sink through the floor', () => {
  const W = 200, H = 400, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const pieces = C.extractPieces(g, C.cellsInCircle(g, 100, 100, 60), 'confetti');
  pieces.forEach((p, i) => { p.x = 100; p.y = 20 - i * 3; });     // all dropped over the same spot
  simulate(pieces, { W, H, field, gentle: false }, 8);
  assert.ok(pieces.every((p) => p.state === 'rest'));
  assert.ok(pieces.every((p) => p.y + C.extents(p.w, p.h, p.ang).hh <= H + 0.5), 'nothing below the floor');
  const ys = pieces.map((p) => p.y);
  assert.ok(Math.min(...ys) < H - C.CELL * 3, 'they piled up instead of overlapping on one line');
});

test('pieces stay inside the left and right walls', () => {
  const W = 200, H = 300, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const [p] = C.extractPieces(g, [0], 'confetti');
  p.vx = -2000;
  simulate([p], { W, H, field, gentle: false }, 3);
  assert.ok(p.x - C.extents(p.w, p.h, p.ang).hw >= -0.01);
});

test('gentle mode: no pile, pieces fade away and are marked gone', () => {
  const W = 200, H = 400, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const [p] = C.extractPieces(g, [5 * g.cols + 5], 'confetti');
  const ev = simulate([p], { W, H, field, gentle: true }, 3);
  assert.equal(p.state, 'gone');
  assert.ok(ev.some(([, e]) => e === 'gone'));
  assert.equal(C.pileHeight(field, 0, W), 0);
  assert.equal(p.ang, 0, 'no spinning in gentle mode');
});

test('glue sends a fallen piece home and reports arrival', () => {
  const W = 300, H = 400, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const [p] = C.extractPieces(g, [2 * g.cols + 5], 'confetti');
  const ctx = { W, H, field, gentle: false };
  simulate([p], ctx, 3);
  C.sendHome(p, 0);
  const ev = simulate([p], ctx, 4);
  assert.ok(ev.some(([, e]) => e === 'arrived'));
  assert.ok(Math.abs(p.x - p.hx) < 1 && Math.abs(p.y - p.hy) < 1 && Math.abs(p.ang) < 0.03);
});

test('gentle glue fades a gone piece back in at its home', () => {
  const W = 200, H = 400, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const [p] = C.extractPieces(g, [3 * g.cols + 3], 'confetti');
  const ctx = { W, H, field, gentle: true };
  simulate([p], ctx, 3);
  assert.equal(p.state, 'gone');
  C.sendHome(p, 0);
  assert.equal(p.alpha, 0);
  const ev = simulate([p], ctx, 2);
  assert.ok(ev.some(([, e]) => e === 'arrived'));
  assert.equal(p.x, p.hx);
});

test('removing a piece from under the pile makes the pieces above fall', () => {
  const W = 200, H = 300, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const pieces = C.extractPieces(g, C.cellsInCircle(g, 100, 60, 35), 'confetti').slice(0, 14);
  pieces.forEach((p, i) => { p.x = 100; p.y = -i * 4; });
  const ctx = { W, H, field, gentle: false };
  simulate(pieces, ctx, 8);
  pieces.sort((a, b) => b.y - a.y);
  const bottom = pieces[0];
  C.sendHome(bottom, 0);                       // pull the lowest piece out
  const woken = C.settleAll(field, pieces, H);
  assert.ok(woken > 0, 'something above lost its support and was woken');
  assert.ok(pieces.filter((p) => p.state === 'fall').length === woken);
});

test('settleAll keeps well-supported pieces asleep', () => {
  const W = 200, H = 300, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const pieces = C.extractPieces(g, [1, 2, 3], 'confetti');
  pieces.forEach((p, i) => { p.x = 40 + i * 50; p.y = 0; });
  simulate(pieces, { W, H, field, gentle: false }, 4);
  assert.equal(C.settleAll(field, pieces, H), 0);
  assert.ok(pieces.every((p) => p.state === 'rest'));
});

test('shove wakes a resting piece and moves it sideways', () => {
  const W = 200, H = 300, field = C.makeField(W);
  const g = C.makeGrid(W, H);
  const [p] = C.extractPieces(g, [10], 'confetti');
  simulate([p], { W, H, field, gentle: false }, 3);
  const x0 = p.x;
  C.shove(p, 400, 0);
  assert.equal(p.state, 'fall');
  simulate([p], { W, H, field, gentle: false }, 1);
  assert.ok(p.x > x0 + 20);
});
