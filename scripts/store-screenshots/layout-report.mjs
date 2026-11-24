// Reads and writes apps/mobile/store/screenshots/layout-report.json: the
// measured caption box of every composed screenshot, recorded by compose.mjs
// and checked by validate.mjs (see layout-checks.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { LAYOUT_REPORT_FILE } from './layout-checks.mjs';
import { SCREENSHOT_ROOT } from './specs.mjs';

export function layoutReportPath(root) {
  return path.join(root, SCREENSHOT_ROOT, LAYOUT_REPORT_FILE);
}

const round = (value) => Math.round(value * 10) / 10;

/** Rounds a measured `{ x, y, width, height }` box. */
function box({ x, y, width, height }) {
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

/**
 * The report entry for a page-script result on a [width]x[height] canvas.
 * [sha256] is the hash of the written image, so a report that was measured on
 * another image is caught.
 */
export function reportEntry({ width, height, layout }, measured, sha256) {
  const { caption, headline, card, chip } = measured;
  return {
    canvas: { width, height },
    layout,
    caption: box(caption),
    card: box(card),
    ...(chip ? { chip: { ...box(chip), fontSize: round(chip.fontSize) } } : {}),
    headline: { fontSize: round(headline.fontSize), lines: headline.lines },
    sha256,
  };
}

/** Existing entries by screenshot path (relative to the screenshot root). */
export function readLayoutReport(root) {
  const file = layoutReportPath(root);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')).files ?? {};
}

/**
 * Writes [entries] merged over the report already under [root], dropping
 * entries whose screenshot no longer exists. Keys are sorted so reruns
 * produce no diff.
 */
export function writeLayoutReport(root, entries) {
  const merged = { ...readLayoutReport(root), ...entries };
  const files = {};
  for (const key of Object.keys(merged).sort()) {
    if (fs.existsSync(path.join(root, SCREENSHOT_ROOT, key)))
      files[key] = merged[key];
  }
  const file = layoutReportPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ version: 1, unit: 'px', files }, null, 2)}\n`
  );
  return files;
}
