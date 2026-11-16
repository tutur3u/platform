#!/usr/bin/env node
// Checks composed store images: exact pixel sizes, RGB screenshots in each
// target's format (JPEG, or opaque PNG), opaque PNG graphics, per-file store limits, the committed
// size budget, that every screenshot the metadata lists exists, and the web
// gallery WebP limits and manifest sizes.
//
//   node scripts/store-screenshots/validate.mjs [--root <repo>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readImageInfo } from './image-info.mjs';
import {
  GRAPHIC_TARGETS,
  OUTPUT_BUDGET_BYTES,
  SCREENSHOT_ROOT,
  SCREENSHOT_TARGETS,
  screenshotExt,
  WEB_GALLERY,
} from './specs.mjs';

const WEB_PATTERN = /^([a-z]+)\/web\/(\d{2})-([a-z][a-z0-9-]*)\.webp$/;
const FILE_PATTERN =
  /^([a-z]+)\/([a-z0-9.-]+)\/([a-z]{2})\/(\d{2})-([a-z][a-z0-9-]*)\.(jpg|png)$/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (!entry.name.startsWith('.')) files.push(full);
  }
  return files;
}

/** Checks one screenshot file; returns a list of problems. */
export function checkScreenshot(relativePath, buffer) {
  const match = FILE_PATTERN.exec(relativePath);
  if (!match)
    return [
      `${relativePath}: name must be <store>/<device>/<locale>/NN-<id>.jpg|png`,
    ];
  const [, store, device, , , , ext] = match;
  const target = SCREENSHOT_TARGETS.find(
    (t) => t.store === store && t.device === device
  );
  if (!target) return [`${relativePath}: unknown target ${store}/${device}`];
  if (ext !== screenshotExt(target))
    return [
      `${relativePath}: ${store}/${device} screenshots are .${screenshotExt(target)}`,
    ];
  const format = ext === 'png' ? 'png' : 'jpeg';
  const info = readImageInfo(buffer);
  const problems = [];
  if (!info || info.format !== format)
    return [`${relativePath}: not a ${format.toUpperCase()}`];
  if (info.width !== target.width || info.height !== target.height) {
    problems.push(
      `${relativePath}: ${info.width}x${info.height}, expected ${target.width}x${target.height}`
    );
  }
  if (info.alpha) problems.push(`${relativePath}: has an alpha channel`);
  else if (info.channels !== 3)
    problems.push(`${relativePath}: ${info.channels} channels, expected RGB`);
  if (buffer.length > target.maxBytes) {
    problems.push(
      `${relativePath}: ${buffer.length} bytes exceeds the store limit of ${target.maxBytes}`
    );
  }
  return problems;
}

/** Checks one web gallery WebP; returns { problems, info }. */
export function checkWebImage(relativePath, buffer) {
  const match = WEB_PATTERN.exec(relativePath);
  if (!match)
    return {
      problems: [`${relativePath}: name must be <platform>/web/NN-<id>.webp`],
      info: null,
    };
  if (!(match[1] in WEB_GALLERY.sources)) {
    return {
      problems: [`${relativePath}: unknown platform ${match[1]}`],
      info: null,
    };
  }
  const info = readImageInfo(buffer);
  if (!info || info.format !== 'webp')
    return { problems: [`${relativePath}: not a WebP`], info: null };
  const problems = [];
  if (Math.max(info.width, info.height) > WEB_GALLERY.maxLongEdge) {
    problems.push(
      `${relativePath}: ${info.width}x${info.height} exceeds ${WEB_GALLERY.maxLongEdge} px on the long edge`
    );
  }
  if (buffer.length > WEB_GALLERY.maxBytes) {
    problems.push(
      `${relativePath}: ${buffer.length} bytes exceeds ${WEB_GALLERY.maxBytes}`
    );
  }
  return { problems, info };
}

/** Checks a platform's web gallery folder against its manifest. */
export function checkWebGallery(screenshotDir, platform) {
  const webDir = path.join(screenshotDir, platform, 'web');
  const problems = [];
  const images = fs
    .readdirSync(webDir)
    .filter((name) => name.endsWith('.webp'))
    .sort();
  if (images.length > WEB_GALLERY.maxPerPlatform) {
    problems.push(
      `${platform}/web: ${images.length} images, at most ${WEB_GALLERY.maxPerPlatform}`
    );
  }
  const manifestFile = path.join(webDir, 'manifest.json');
  if (!fs.existsSync(manifestFile))
    return [...problems, `${platform}/web: manifest.json is missing`];
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const listed = new Map(
    (manifest.items ?? []).map((item) => [path.basename(item.file), item])
  );
  for (const name of images) {
    const item = listed.get(name);
    const relative = `${platform}/web/${name}`;
    if (!item) {
      problems.push(`${relative}: not in manifest.json`);
      continue;
    }
    const { info } = checkWebImage(
      relative,
      fs.readFileSync(path.join(webDir, name))
    );
    if (info && (item.width !== info.width || item.height !== info.height)) {
      problems.push(
        `${relative}: manifest says ${item.width}x${item.height}, file is ${info.width}x${info.height}`
      );
    }
    listed.delete(name);
  }
  for (const name of listed.keys())
    problems.push(`${platform}/web/${name}: in manifest.json but missing`);
  return problems;
}

/** Checks one opaque PNG graphic; returns a list of problems. */
export function checkGraphic(graphic, buffer) {
  const info = readImageInfo(buffer);
  if (!info || info.format !== 'png') return [`${graphic.file}: not a PNG`];
  const problems = [];
  if (info.width !== graphic.width || info.height !== graphic.height) {
    problems.push(
      `${graphic.file}: ${info.width}x${info.height}, expected ${graphic.width}x${graphic.height}`
    );
  }
  if (info.alpha) problems.push(`${graphic.file}: has an alpha channel`);
  if (buffer.length > graphic.maxBytes)
    problems.push(`${graphic.file}: exceeds ${graphic.maxBytes} bytes`);
  return problems;
}

/** Screenshot files the store metadata lists, by repository path. */
export function listedScreenshots(metadataDir) {
  const listed = new Set();
  if (!fs.existsSync(metadataDir)) return listed;
  for (const name of fs.readdirSync(metadataDir)) {
    if (!name.endsWith('.json') || name === 'schema.json') continue;
    const metadata = JSON.parse(
      fs.readFileSync(path.join(metadataDir, name), 'utf8')
    );
    for (const entries of Object.values(metadata.screenshots ?? {})) {
      for (const entry of entries) {
        for (const file of Object.values(entry.files ?? {})) listed.add(file);
      }
    }
  }
  return listed;
}

/** Validates everything under [root]; returns { problems, totalBytes, count }. */
export function validateStoreImages(root) {
  const problems = [];
  const screenshotDir = path.join(root, SCREENSHOT_ROOT);
  const files = walk(screenshotDir);
  let totalBytes = 0;
  let screenshotCount = 0;
  const webPlatforms = new Set();
  const storesWithShots = new Set();
  for (const file of files) {
    const buffer = fs.readFileSync(file);
    totalBytes += buffer.length;
    const relative = path
      .relative(screenshotDir, file)
      .split(path.sep)
      .join('/');
    if (/^[a-z]+\/web\//.test(relative)) {
      if (relative.endsWith('/manifest.json')) continue;
      problems.push(...checkWebImage(relative, buffer).problems);
      webPlatforms.add(relative.split('/')[0]);
      continue;
    }
    screenshotCount += 1;
    storesWithShots.add(relative.split('/')[0]);
    problems.push(...checkScreenshot(relative, buffer));
  }
  for (const platform of webPlatforms)
    problems.push(...checkWebGallery(screenshotDir, platform));
  if (totalBytes > OUTPUT_BUDGET_BYTES) {
    problems.push(
      `screenshots total ${totalBytes} bytes, over the ${OUTPUT_BUDGET_BYTES}-byte budget`
    );
  }
  for (const graphic of GRAPHIC_TARGETS) {
    const file = path.join(root, graphic.file);
    if (fs.existsSync(file))
      problems.push(...checkGraphic(graphic, fs.readFileSync(file)));
  }
  // Once a store has any screenshot committed, its listed set must be
  // complete; stores can land one at a time.
  for (const listed of listedScreenshots(
    path.join(root, 'apps/mobile/store/metadata')
  )) {
    const store = listed.slice(SCREENSHOT_ROOT.length + 1).split('/')[0];
    if (!storesWithShots.has(store)) continue;
    if (!fs.existsSync(path.join(root, listed)))
      problems.push(`${listed}: listed in metadata but missing`);
  }
  return { problems, totalBytes, count: screenshotCount };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const { values } = parseArgs({
    options: {
      root: {
        type: 'string',
        default: path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          '../..'
        ),
      },
    },
  });
  const { problems, totalBytes, count } = validateStoreImages(values.root);
  console.log(
    `${count} screenshots, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`
  );
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}
