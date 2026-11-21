#!/usr/bin/env node
// Composes store listing images from raw app captures.
//
//   node scripts/store-screenshots/compose.mjs --raw <dir> [options]
//
// <dir> holds `<store>/<device>/<locale>/NN-<id>.png` from
// apps/mobile/test/store_screenshots. Writes screenshots to
// apps/mobile/store/screenshots/<store>/<device>/<locale>/NN-<id>.jpg, or .png
// for targets with `format: 'png'` (Microsoft Store) (paths
// from apps/mobile/store/metadata when present) and the opaque PNG graphics
// (Play feature graphic, Microsoft Store hero) to apps/mobile/store/graphics.
//
// Options:
//   --metadata <dir>   store metadata (default apps/mobile/store/metadata)
//   --out <dir>        repository root to write under (default: this repo)
//   --only <ids>       comma-separated `<store>/<device>` targets
//   --locales <ids>    comma-separated locales (default en,vi)
//   --plate <png>      background plate image instead of the drawn discs
//   --no-graphics      skip the feature graphic and hero
//   --gallery-only     only rebuild the web gallery from composed screenshots
//
// It also writes the /roadmap web gallery: up to six EN shots per platform as
// `<platform>/web/NN-<id>.webp` (at most 1280 px on the long edge and 150 KB
// each) with a `manifest.json` that gives each file's width and height.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadMetadata, planScreens } from './captions.mjs';
import { toOpaqueRgbPng } from './png-rgb.mjs';
import { writeWebGallery } from './web-gallery.mjs';
import {
  GRAPHIC_TARGETS,
  JPEG_QUALITY,
  LOCALES,
  SCREENSHOT_TARGETS,
} from './specs.mjs';
import {
  featureGraphicHtml,
  graphicSpec,
  heroHtml,
  screenshotHtml,
  screenshotSpec,
} from './template.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

// The workspace uses Bun's isolated linker, so Playwright resolves from a
// workspace that depends on it when the root cannot see it.
async function loadChromium() {
  const candidates = [
    pathToFileURL(path.join(REPO_ROOT, 'package.json')).href,
    pathToFileURL(path.join(REPO_ROOT, 'apps/admin/package.json')).href,
    pathToFileURL(path.join(REPO_ROOT, 'apps/contacts/package.json')).href,
  ];
  for (const from of candidates) {
    for (const name of ['playwright', '@playwright/test']) {
      try {
        const resolved = createRequire(from).resolve(name);
        const mod = await import(pathToFileURL(resolved).href);
        const chromium = mod.chromium ?? mod.default?.chromium;
        if (chromium) return chromium;
      } catch {
        // Try the next workspace.
      }
    }
  }
  throw new Error(
    'Playwright is not installed. Run `bun install`, then `bunx playwright install chromium`.'
  );
}

function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Finds `<rawDir>/<store>/<device>/<locale>/NN-<id>.png` by screen id. */
export function findRaw(rawDir, target, locale, id) {
  const dir = path.join(rawDir, target.store, target.device, locale);
  if (!fs.existsSync(dir)) return null;
  const match = fs
    .readdirSync(dir)
    .find((name) => /^\d{2}-/.test(name) && name.slice(3) === `${id}.png`);
  return match ? path.join(dir, match) : null;
}

async function render(page, html, width, height, spec) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const fontsLoaded = await page.evaluate((s) => window.__layout(s), spec);
  if (!fontsLoaded)
    throw new Error(
      'Nunito did not load; check network access to Google Fonts.'
    );
}

async function main() {
  const { values } = parseArgs({
    options: {
      raw: { type: 'string' },
      metadata: {
        type: 'string',
        default: path.join(REPO_ROOT, 'apps/mobile/store/metadata'),
      },
      out: { type: 'string', default: REPO_ROOT },
      only: { type: 'string' },
      locales: { type: 'string', default: LOCALES.join(',') },
      plate: { type: 'string' },
      'no-graphics': { type: 'boolean', default: false },
      'gallery-only': { type: 'boolean', default: false },
    },
  });
  const galleryOnly = values['gallery-only'];
  if (!values.raw && !galleryOnly) throw new Error('--raw <dir> is required');
  const rawDir = galleryOnly ? '' : path.resolve(values.raw);
  const only = values.only ? new Set(values.only.split(',')) : null;
  const locales = values.locales.split(',');
  const plateUrl = values.plate ? dataUrl(values.plate) : undefined;

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const missing = [];
  let written = 0;
  try {
    for (const target of SCREENSHOT_TARGETS) {
      if (galleryOnly) break;
      if (only && !only.has(`${target.store}/${target.device}`)) continue;
      const metadata = loadMetadata(values.metadata, target.store);
      for (const locale of locales) {
        for (const screen of planScreens(metadata, target, locale)) {
          const raw = findRaw(rawDir, target, locale, screen.id);
          if (!raw) {
            missing.push(
              `${target.store}/${target.device}/${locale}/${screen.id}`
            );
            continue;
          }
          const html = screenshotHtml({
            target,
            screenId: screen.id,
            headline: screen.headline,
            rawUrl: dataUrl(raw),
            plateUrl,
          });
          await render(
            page,
            html,
            target.width,
            target.height,
            screenshotSpec(target)
          );
          const out = path.join(values.out, screen.file);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          if (out.endsWith('.png')) {
            fs.writeFileSync(
              out,
              toOpaqueRgbPng(await page.screenshot({ type: 'png' }))
            );
          } else {
            await page.screenshot({
              path: out,
              type: 'jpeg',
              quality: JPEG_QUALITY,
            });
          }
          written += 1;
        }
      }
    }

    if (!values['no-graphics'] && !galleryOnly) {
      const pick = (store, device, id) =>
        findRaw(
          rawDir,
          SCREENSHOT_TARGETS.find(
            (t) => t.store === store && t.device === device
          ),
          'en',
          id
        );
      const phoneDashboard = pick('ios', 'iphone-6.9', 'dashboard');
      const phoneCalendar = pick('ios', 'iphone-6.9', 'calendar');
      const desktopDashboard = pick('windows', 'desktop', 'dashboard');
      const icon = path.join(REPO_ROOT, 'apps/mobile/assets/app_icon.png');
      for (const graphic of GRAPHIC_TARGETS) {
        let html;
        if (
          graphic.id === 'feature-graphic' &&
          phoneDashboard &&
          phoneCalendar
        ) {
          html = featureGraphicHtml({
            iconUrl: dataUrl(icon),
            phoneUrls: [dataUrl(phoneDashboard), dataUrl(phoneCalendar)],
            plateUrl,
          });
        } else if (graphic.id === 'hero' && desktopDashboard && phoneCalendar) {
          html = heroHtml({
            desktopUrl: dataUrl(desktopDashboard),
            phoneUrl: dataUrl(phoneCalendar),
            plateUrl,
          });
        } else {
          missing.push(`graphic ${graphic.id}`);
          continue;
        }
        await render(page, html, graphic.width, graphic.height, graphicSpec());
        const png = await page.screenshot({ type: 'png' });
        const out = path.join(values.out, graphic.file);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, toOpaqueRgbPng(png));
        written += 1;
      }
    }

    const gallery = await writeWebGallery(page, values.out, values.metadata);
    for (const items of Object.values(gallery)) {
      for (const item of items) {
        console.log(
          `${item.file} ${item.width}x${item.height} ${(item.bytes / 1024).toFixed(0)} KB`
        );
      }
      written += items.length;
    }
  } finally {
    await browser.close();
  }

  console.log(`Wrote ${written} images.`);
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
