import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOverlayPosition} from '../src/overlay-position.js';

// A typical 16" display: 1728x1080 with a 25px menu bar.
const MAC = {x: 0, y: 25, width: 1728, height: 1055};
const BOUNDS = {width: 560, height: 460};

const place = (x, y, workArea = MAC, bounds = BOUNDS) =>
  computeOverlayPosition({point: {x, y}, bounds, workArea});

const inside = (pos, workArea = MAC, bounds = BOUNDS) => {
  assert.ok(pos.x >= workArea.x, `x ${pos.x} left of work area`);
  assert.ok(pos.x + bounds.width <= workArea.x + workArea.width,
    `x ${pos.x} + ${bounds.width} overflows right edge`);
  assert.ok(pos.y >= workArea.y, `y ${pos.y} above work area`);
  assert.ok(pos.y + bounds.height <= workArea.y + workArea.height,
    `y ${pos.y} + ${bounds.height} overflows bottom edge`);
};

test('sits below the cursor with room to spare', () => {
  const pos = place(864, 400);
  assert.equal(pos.y, 412);
  assert.equal(pos.x, 584); // 864 - 280
  inside(pos);
});

test('centres horizontally on the cursor', () => {
  assert.equal(place(900, 300).x, 620);
  assert.equal(place(600, 300).x, 320);
});

test('flips above the cursor near the bottom edge', () => {
  const cursorY = 1000; // no room for 460px below
  const pos = place(864, cursorY);
  assert.equal(pos.y, cursorY - 12 - 460); // 528
  inside(pos);
});

test('clamps to the top when the flip would leave the screen', () => {
  // A short work area is what actually produces this: with a full-height display
  // a low cursor flips to a y that is still well inside the screen.
  const short = {x: 0, y: 25, width: 1728, height: 500};
  const pos = place(864, 480, short);
  assert.equal(pos.y, short.y);
  inside(pos, short);
});

test('clamps to the right edge', () => {
  const pos = place(1720, 300);
  assert.equal(pos.x, 1728 - 560); // 1168
  inside(pos);
});

test('clamps to the left edge', () => {
  const pos = place(5, 300);
  assert.equal(pos.x, 0);
  inside(pos);
});

test('stays on a display placed left of the main one (negative origin)', () => {
  const left = {x: -1920, y: 25, width: 1920, height: 1055};
  const pos = place(-1800, 300, left);
  assert.equal(pos.x, -1920);
  inside(pos, left);
});

test('stays on a display placed above the main one (negative y)', () => {
  const above = {x: 0, y: -1080, width: 1728, height: 1080};
  const pos = place(864, -1000, above);
  assert.equal(pos.y, -988); // -1000 + 12: room below on that display
  inside(pos, above);
});

test('never leaves the work area at any cursor position', () => {
  // Sweep the whole display; every result must be fully on screen.
  for (let x = 0; x <= MAC.width; x += 40) {
    for (let y = MAC.y; y <= MAC.y + MAC.height; y += 40) {
      inside(place(x, y));
    }
  }
});

test('a window taller than the display pins to the top, not off-screen', () => {
  const tiny = {x: 0, y: 25, width: 1280, height: 300};
  const big = {width: 560, height: 460};
  const pos = computeOverlayPosition({point: {x: 640, y: 200}, bounds: big, workArea: tiny});
  assert.equal(pos.y, tiny.y);
  assert.ok(pos.x >= tiny.x);
});

test('a window wider than the display pins to the left edge', () => {
  const narrow = {x: 0, y: 25, width: 400, height: 800};
  const wide = {width: 560, height: 460};
  const pos = computeOverlayPosition({point: {x: 200, y: 100}, bounds: wide, workArea: narrow});
  assert.equal(pos.x, 0);
});

test('the taller panel flips where the old one still fit below', () => {
  // 1080 - (650 + 12) = 418px of room below: enough for 380, not for 460.
  const cursorY = 650;
  const old = computeOverlayPosition({
    point: {x: 864, y: cursorY},
    bounds: {width: 560, height: 380},
    workArea: MAC,
  });
  const now = computeOverlayPosition({
    point: {x: 864, y: cursorY}, bounds: BOUNDS, workArea: MAC,
  });
  assert.equal(old.y, cursorY + 12);          // 662, sat below
  assert.equal(now.y, cursorY - 12 - 460);    // 178, flipped
  inside(old, MAC, {width: 560, height: 380});
  inside(now);
});
