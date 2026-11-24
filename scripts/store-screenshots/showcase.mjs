#!/usr/bin/env node
// Exports the roadmap feature previews: every showcase screen on every device
// in light and dark Sorbet, in English and Vietnamese, as transparent AVIF
// (primary) and WebP (fallback) files plus a manifest.
//
//   node scripts/store-screenshots/showcase.mjs --raw apps/mobile/build/store_raw
//
// <raw> holds `showcase/<device>-<theme>/<locale>/NN-<id>.png` from
// apps/mobile/test/store_screenshots (`STORE_SHOWCASE=1`). Output goes to
// packages/roadmap-core/src/assets/previews/app/<screen>/
// <device>-<theme>-<locale>.avif|.webp and manifest.json.
//
// Options: --out <repo root>, --devices, --themes, --locales, --screens
// (comma-separated filters; the manifest keeps entries for files already
// written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadChromium, loadSharp } from './deps.mjs';
import { SHOWCASE, SHOWCASE_DEVICES } from './specs.mjs';
import { showcaseHtml, showcaseLayout } from './showcase-template.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

export function previewFile(screen, device, theme, locale, ext) {
  return `${SHOWCASE.root}/${screen}/${device}-${theme}-${locale}.${ext}`;
}

/**
 * Encodes with the highest quality from [qualities] whose output fits
 * [maxBytes]. [encode] maps a quality to a Buffer.
 * @returns {Promise<{ buffer: Buffer, quality: number }>}
 */
export async function encodeToBudget(encode, qualities, maxBytes) {
  let last = 0;
  for (const quality of qualities) {
    const buffer = await encode(quality);
    last = buffer.length;
    if (buffer.length <= maxBytes) return { buffer, quality };
  }
  throw new Error(
    `Cannot fit ${maxBytes} bytes at quality ${qualities.at(-1)} (smallest ${last})`
  );
}

/** Finds `<raw>/showcase/<device>-<theme>/<locale>/NN-<id>.png` by id. */
export function findShowcaseRaw(rawDir, device, theme, locale, id) {
  const dir = path.join(
    rawDir,
    SHOWCASE.rawStore,
    `${device}-${theme}`,
    locale
  );
  if (!fs.existsSync(dir)) return null;
  const match = fs
    .readdirSync(dir)
    .find((name) => /^\d{2}-/.test(name) && name.slice(3) === `${id}.png`);
  return match ? path.join(dir, match) : null;
}

const order = (item) => [
  SHOWCASE.screens.indexOf(item.screen),
  Object.keys(SHOWCASE_DEVICES).indexOf(item.device),
  SHOWCASE.themes.indexOf(item.theme),
  SHOWCASE.locales.indexOf(item.locale),
];

/** Manifest order: screen, device, theme, locale as listed in the specs. */
export function compareItems(a, b) {
  const [x, y] = [order(a), order(b)];
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

const list = (value, all) => (value ? value.split(',') : all);

async function main() {
  const { values } = parseArgs({
    options: {
      raw: { type: 'string' },
      out: { type: 'string', default: REPO_ROOT },
      devices: { type: 'string' },
      themes: { type: 'string' },
      locales: { type: 'string' },
      screens: { type: 'string' },
    },
  });
  if (!values.raw) throw new Error('--raw <dir> is required');
  const rawDir = path.resolve(values.raw);
  const devices = list(values.devices, Object.keys(SHOWCASE_DEVICES));
  const themes = list(values.themes, SHOWCASE.themes);
  const locales = list(values.locales, SHOWCASE.locales);
  const screens = list(values.screens, SHOWCASE.screens);

  const sharp = await loadSharp();
  const browser = await (await loadChromium()).launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const manifestFile = path.join(values.out, SHOWCASE.root, 'manifest.json');
  const entries = new Map();
  if (fs.existsSync(manifestFile)) {
    for (const item of JSON.parse(fs.readFileSync(manifestFile, 'utf8')).items)
      entries.set(item.avif, item);
  }
  const missing = [];
  try {
    for (const screen of screens) {
      for (const device of devices) {
        const spec = SHOWCASE_DEVICES[device];
        if (!spec) throw new Error(`Unknown showcase device ${device}`);
        for (const theme of themes) {
          for (const locale of locales) {
            const raw = findShowcaseRaw(rawDir, device, theme, locale, screen);
            if (!raw) {
              missing.push(`${device}-${theme}/${locale}/${screen}`);
              continue;
            }
            const meta = await sharp(raw).metadata();
            const layout = showcaseLayout(spec, meta.width, meta.height);
            const scaled = await sharp(raw)
              .resize(layout.screenWidth, layout.screenHeight, {
                kernel: 'lanczos3',
              })
              .removeAlpha()
              .png()
              .toBuffer();
            const html = showcaseHtml({
              layout,
              theme,
              rawUrl: `data:image/png;base64,${scaled.toString('base64')}`,
            });
            await page.setViewportSize({
              width: layout.width,
              height: layout.height,
            });
            await page.setContent(html, { waitUntil: 'load' });
            const canvas = await page.screenshot({
              type: 'png',
              omitBackground: true,
            });
            const avif = await encodeToBudget(
              (quality) =>
                sharp(canvas)
                  .avif({ quality, effort: 5, chromaSubsampling: '4:2:0' })
                  .toBuffer(),
              SHOWCASE.avifQualities,
              SHOWCASE.avifMaxBytes
            );
            const webp = await encodeToBudget(
              (quality) =>
                sharp(canvas)
                  .webp({ quality, alphaQuality: 90, effort: 5 })
                  .toBuffer(),
              SHOWCASE.webpQualities,
              SHOWCASE.webpMaxBytes
            );
            const avifPath = previewFile(screen, device, theme, locale, 'avif');
            const webpPath = previewFile(screen, device, theme, locale, 'webp');
            for (const [file, buffer] of [
              [avifPath, avif.buffer],
              [webpPath, webp.buffer],
            ]) {
              const out = path.join(values.out, file);
              fs.mkdirSync(path.dirname(out), { recursive: true });
              fs.writeFileSync(out, buffer);
            }
            entries.set(avifPath, {
              screen,
              device,
              theme,
              locale,
              width: layout.width,
              height: layout.height,
              avif: avifPath,
              webp: webpPath,
              avifBytes: avif.buffer.length,
              webpBytes: webp.buffer.length,
            });
            console.log(
              `${avifPath} ${layout.width}x${layout.height} avif ${(avif.buffer.length / 1024).toFixed(0)} KB (q${avif.quality}) webp ${(webp.buffer.length / 1024).toFixed(0)} KB (q${webp.quality})`
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const items = [...entries.values()]
    .filter((item) => fs.existsSync(path.join(values.out, item.avif)))
    .sort(compareItems);
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(
    manifestFile,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2)}\n`
  );
  console.log(`Wrote ${items.length} manifest items.`);
  if (missing.length > 0) {
    console.error(
      `Missing raw captures (${missing.length}):\n  ${missing.join('\n  ')}`
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
