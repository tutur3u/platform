// Caption layout rules for composed store images. compose.mjs measures every
// caption in the browser and records it in layout-report.json; these pure
// functions check a recorded entry against the safe area, the line limit and
// the font-size floor.
import {
  headlineClass,
  MAX_HEADLINE_LINES,
  MIN_HEADLINE_RATIO,
} from './template-layout.mjs';

/** Captions keep this share of each dimension clear on every edge. */
export const SAFE_INSET = 0.05;

/** Nothing sits in the top or bottom share of the height. */
export const SAFE_BAND = 0.04;

/** Report path under the screenshot root. */
export const LAYOUT_REPORT_FILE = 'layout-report.json';

const TOLERANCE = 0.5;

/**
 * Problems with one report entry.
 * @param {string} file screenshot path relative to the screenshot root
 * @param {{ canvas: { width: number, height: number },
 *   caption: { x: number, y: number, width: number, height: number },
 *   headline: { fontSize: number, lines: number } }} entry
 * @param {{ frame: string }} target
 */
export function checkCaptionLayout(file, entry, target) {
  const { canvas, caption, headline } = entry ?? {};
  if (!canvas || !caption || !headline)
    return [`${file}: layout report entry is incomplete`];
  const problems = [];
  const left = caption.x;
  const right = canvas.width - (caption.x + caption.width);
  const top = caption.y;
  const bottom = canvas.height - (caption.y + caption.height);
  const edges = [
    ['left', left, canvas.width],
    ['right', right, canvas.width],
    ['top', top, canvas.height],
    ['bottom', bottom, canvas.height],
  ];
  for (const [name, gap, extent] of edges) {
    const need =
      Math.max(SAFE_INSET, ['top', 'bottom'].includes(name) ? SAFE_BAND : 0) *
      extent;
    if (gap + TOLERANCE < need) {
      problems.push(
        `${file}: caption is ${gap.toFixed(0)} px from the ${name} edge, needs at least ${need.toFixed(0)} px (${SAFE_INSET * 100}%)`
      );
    }
  }
  if (headline.lines > MAX_HEADLINE_LINES) {
    problems.push(
      `${file}: headline runs ${headline.lines} lines, at most ${MAX_HEADLINE_LINES}`
    );
  }
  const ratio = MIN_HEADLINE_RATIO[headlineClass(target)];
  const min = ratio * canvas.width;
  if (headline.fontSize + TOLERANCE < min) {
    problems.push(
      `${file}: headline is ${headline.fontSize.toFixed(0)} px, needs at least ${min.toFixed(0)} px (${(ratio * 100).toFixed(1)}% of the width)`
    );
  }
  return problems;
}

/**
 * Checks a whole report: every screenshot has an entry sized like its image
 * and every entry names a screenshot that exists.
 * @param {Record<string, object>} entries report `files`
 * @param {Map<string, { width: number, height: number, target: object }>} screenshots
 */
export function checkLayoutReport(entries, screenshots) {
  const problems = [];
  for (const [file, shot] of screenshots) {
    const entry = entries[file];
    if (!entry) {
      problems.push(`${file}: missing from ${LAYOUT_REPORT_FILE}`);
      continue;
    }
    if (
      entry.canvas?.width !== shot.width ||
      entry.canvas?.height !== shot.height
    ) {
      problems.push(
        `${file}: ${LAYOUT_REPORT_FILE} says ${entry.canvas?.width}x${entry.canvas?.height}, image is ${shot.width}x${shot.height}`
      );
    }
    problems.push(...checkCaptionLayout(file, entry, shot.target));
  }
  for (const file of Object.keys(entries)) {
    if (!screenshots.has(file))
      problems.push(`${file}: in ${LAYOUT_REPORT_FILE} but not a screenshot`);
  }
  return problems;
}
