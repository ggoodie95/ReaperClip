/**
 * Geometry for placing the clipboard panel.
 *
 * Kept out of main.js as a pure function so it can be tested with plain node —
 * no display, no Electron runtime, no browser. main.js supplies the cursor
 * point, the window bounds and the work area from electron's screen module.
 */

/**
 * @param {object} args
 * @param {{x: number, y: number}} args.point   cursor position (screen coords)
 * @param {{width: number, height: number}} args.bounds  window size
 * @param {{x: number, y: number, width: number, height: number}} args.workArea
 *        display area excluding the menu bar and dock
 * @param {number} [args.gap]  pixels between the anchor and the panel
 * @param {number} [args.inset] extra margin kept inside the work area, used by
 *        the tray path which sits 6px clear of the display edges
 * @returns {{x: number, y: number}}
 */
export function computeOverlayPosition({ point, bounds, workArea, gap = 12, inset = 0 }) {
  const top = workArea.y + inset;
  const bottom = workArea.y + workArea.height - inset;

  // Prefer sitting just below the anchor. A 460px panel opened near the bottom
  // edge would hang past the screen, so flip it above instead, and never let the
  // flip push it above the work area.
  const spaceBelow = bottom - (point.y + gap);
  const y = spaceBelow >= bounds.height
    ? point.y + gap
    : Math.max(top, point.y - gap - bounds.height);

  // Centre on the anchor horizontally, then hold both edges inside the work
  // area. maxX is guarded so a window wider than the display still starts at
  // the left edge rather than sliding off to the left.
  const left = workArea.x + inset;
  const right = workArea.x + workArea.width - inset;
  const centred = point.x - Math.floor(bounds.width / 2);
  const maxX = Math.max(left, right - bounds.width);
  const x = Math.min(Math.max(left, centred), maxX);

  return { x, y };
}
