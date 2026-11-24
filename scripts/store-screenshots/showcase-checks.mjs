// Checks the committed roadmap feature previews against their manifest: the
// full screen x device x theme x locale set, exact sizes, transparency, the
// long-edge and byte budgets, and no stray files.
import fs from 'node:fs';
import path from 'node:path';
import { readImageInfo } from './image-info.mjs';
import { SHOWCASE, SHOWCASE_DEVICES } from './specs.mjs';

const ITEM_FIELDS = [
  'screen',
  'device',
  'theme',
  'locale',
  'width',
  'height',
  'avif',
  'webp',
  'avifBytes',
  'webpBytes',
];

/** Every `screen/device-theme-locale` key the manifest must list. */
export function expectedKeys() {
  const keys = [];
  for (const screen of SHOWCASE.screens)
    for (const device of Object.keys(SHOWCASE_DEVICES))
      for (const theme of SHOWCASE.themes)
        for (const locale of SHOWCASE.locales)
          keys.push(`${screen}/${device}-${theme}-${locale}`);
  return keys;
}

/** Problems with one manifest item and its two files. */
export function checkShowcaseItem(item, readFile) {
  const label = `${item.screen}/${item.device}-${item.theme}-${item.locale}`;
  const problems = [];
  for (const field of ITEM_FIELDS)
    if (item[field] === undefined) problems.push(`${label}: no ${field}`);
  if (problems.length > 0) return problems;
  const device = SHOWCASE_DEVICES[item.device];
  if (!device) return [`${label}: unknown device ${item.device}`];
  if (Math.max(item.width, item.height) > device.maxEdge)
    problems.push(
      `${label}: ${item.width}x${item.height} exceeds ${device.maxEdge} px on the long edge`
    );
  const base = `${SHOWCASE.root}/${item.screen}/${item.device}-${item.theme}-${item.locale}`;
  for (const [ext, format, maxBytes] of [
    ['avif', 'avif', SHOWCASE.avifMaxBytes],
    ['webp', 'webp', SHOWCASE.webpMaxBytes],
  ]) {
    if (item[ext] !== `${base}.${ext}`)
      problems.push(
        `${label}: ${ext} path ${item[ext]}, expected ${base}.${ext}`
      );
    const buffer = readFile(item[ext]);
    if (!buffer) {
      problems.push(`${item[ext]}: missing`);
      continue;
    }
    const info = readImageInfo(buffer);
    if (!info || info.format !== format) {
      problems.push(`${item[ext]}: not an ${ext.toUpperCase()}`);
      continue;
    }
    if (info.width !== item.width || info.height !== item.height)
      problems.push(
        `${item[ext]}: ${info.width}x${info.height}, manifest says ${item.width}x${item.height}`
      );
    if (!info.alpha) problems.push(`${item[ext]}: has no alpha channel`);
    if (buffer.length !== item[`${ext}Bytes`])
      problems.push(
        `${item[ext]}: ${buffer.length} bytes, manifest says ${item[`${ext}Bytes`]}`
      );
    if (buffer.length > maxBytes)
      problems.push(`${item[ext]}: ${buffer.length} bytes exceeds ${maxBytes}`);
  }
  return problems;
}

/** Validates the previews under [root]; returns { problems, count, bytes }. */
export function validateShowcase(root) {
  const dir = path.join(root, SHOWCASE.root);
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile))
    return {
      problems: [`${SHOWCASE.root}/manifest.json is missing`],
      count: 0,
      bytes: 0,
    };
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const problems = [];
  if (Number.isNaN(Date.parse(manifest.generatedAt)))
    problems.push('manifest.json: generatedAt is not an ISO date');
  const readFile = (file) => {
    const full = path.join(root, file);
    return fs.existsSync(full) ? fs.readFileSync(full) : null;
  };
  const seen = new Set();
  let bytes = 0;
  for (const item of manifest.items ?? []) {
    const key = `${item.screen}/${item.device}-${item.theme}-${item.locale}`;
    if (seen.has(key)) problems.push(`${key}: listed twice`);
    seen.add(key);
    problems.push(...checkShowcaseItem(item, readFile));
    bytes += (item.avifBytes ?? 0) + (item.webpBytes ?? 0);
  }
  for (const key of expectedKeys())
    if (!seen.has(key)) problems.push(`${key}: not in the manifest`);
  const listed = new Set(
    (manifest.items ?? []).flatMap((item) => [item.avif, item.webp])
  );
  const walk = (folder) =>
    fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(folder, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(dir)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (relative.endsWith('/manifest.json') || listed.has(relative)) continue;
    problems.push(`${relative}: not in the manifest`);
  }
  return { problems, count: manifest.items?.length ?? 0, bytes };
}
