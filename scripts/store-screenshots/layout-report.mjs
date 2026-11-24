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

/** The report entry for a page-script result on a [width]x[height] canvas. */
export function reportEntry({ width, height, layout }, measured) {
  const { caption, headline } = measured;
  return {
    canvas: { width, height },
    layout,
    caption: {
      x: round(caption.x),
      y: round(caption.y),
      width: round(caption.width),
      height: round(caption.height),
    },
    headline: { fontSize: round(headline.fontSize), lines: headline.lines },
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
