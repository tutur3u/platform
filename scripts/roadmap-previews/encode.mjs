// Exports a composed PNG as AVIF (primary) and WebP (fallback) within a
// long-edge cap and per-format byte budgets, picking the highest quality that
// fits.
import fs from 'node:fs';
import path from 'node:path';
import { sharp } from './lib.mjs';

const AVIF_BUDGET = 100 * 1024;
const WEBP_BUDGET = 150 * 1024;

async function fit(make, budget, qualities) {
  let last;
  for (const q of qualities) {
    last = await make(q);
    if (last.length <= budget) return last;
  }
  return last;
}

export async function exportImage(png, maxEdge, basePath) {
  const meta = await sharp(png).metadata();
  const factor = Math.min(1, maxEdge / Math.max(meta.width, meta.height));
  const width = Math.round(meta.width * factor);
  const height = Math.round(meta.height * factor);
  const base = sharp(png).resize(width, height, { kernel: 'lanczos3' });
  const [avif, webp] = await Promise.all([
    fit(
      (q) => base.clone().avif({ quality: q, effort: 6 }).toBuffer(),
      AVIF_BUDGET,
      [62, 54, 46, 38, 30]
    ),
    fit(
      (q) =>
        base
          .clone()
          .webp({ quality: q, effort: 6, alphaQuality: 80 })
          .toBuffer(),
      WEBP_BUDGET,
      [82, 74, 66, 58, 50]
    ),
  ]);
  fs.mkdirSync(path.dirname(basePath), { recursive: true });
  fs.writeFileSync(`${basePath}.avif`, avif);
  fs.writeFileSync(`${basePath}.webp`, webp);
  return { width, height, avifBytes: avif.length, webpBytes: webp.length };
}
