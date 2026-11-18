// Screenshot, gallery and graphic checks. Paths are validated always; files
// are measured only when they exist, because the screenshot lane produces
// them after the copy lands.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCALES } from './content-checks.mjs';
import { readImageSize } from './image-size.mjs';

export const GALLERY_MAX_ITEMS = 6;
export const GALLERY_MAX_EDGE = 1280;
export const GALLERY_MAX_BYTES = 150_000;

const nn = (index) => String(index + 1).padStart(2, '0');

export function checkScreenshots(listing, errors) {
  const devices = Object.keys(listing.screenshotDevices ?? {});
  const sets = listing.screenshots ?? {};
  for (const device of devices) {
    if (!(device in sets)) {
      errors.push({
        path: '$.screenshots',
        message: `missing device "${device}"`,
      });
    }
  }
  for (const [device, shots] of Object.entries(sets)) {
    const at = `$.screenshots.${device}`;
    if (!devices.includes(device)) {
      errors.push({ path: at, message: `undeclared device "${device}"` });
      continue;
    }
    if (!Array.isArray(shots)) continue;
    const ids = shots.map((shot) => shot?.id);
    if (new Set(ids).size !== ids.length) {
      errors.push({ path: at, message: 'duplicate screenshot id' });
    }
    const extension = screenshotExtension(listing);
    shots.forEach((shot, index) => {
      for (const locale of LOCALES) {
        const expected = `apps/mobile/store/screenshots/${listing.slug}/${device}/${locale}/${nn(index)}-${shot?.id}.${extension}`;
        if (shot?.files?.[locale] !== expected) {
          errors.push({
            path: `${at}[${index}].files.${locale}`,
            message: `expected ${expected}`,
          });
        }
      }
    });
  }
}

/** Microsoft Store screenshots are opaque PNG; the other stores take JPEG. */
export function screenshotExtension(listing) {
  return listing.slug === 'windows' ? 'png' : 'jpg';
}

export function checkGallery(listing, errors) {
  if (!Array.isArray(listing.gallery)) return;
  const prefix = `apps/mobile/store/screenshots/${listing.slug}/web/`;
  const seen = new Set();
  listing.gallery.forEach((item, index) => {
    const at = `$.gallery[${index}]`;
    const file = typeof item?.file === 'string' ? item.file : '';
    if (!file.startsWith(prefix)) {
      errors.push({ path: `${at}.file`, message: `must start with ${prefix}` });
    }
    if (!file.endsWith('.webp')) {
      errors.push({ path: `${at}.file`, message: 'must be a .webp file' });
    }
    const name = path.posix.basename(file);
    if (!name.startsWith(`${nn(index)}-`)) {
      errors.push({
        path: `${at}.file`,
        message: `must be numbered ${nn(index)}`,
      });
    }
    if (seen.has(name.slice(3))) {
      errors.push({ path: `${at}.file`, message: 'duplicate gallery screen' });
    }
    seen.add(name.slice(3));
    if (Math.max(item?.width ?? 0, item?.height ?? 0) > GALLERY_MAX_EDGE) {
      errors.push({
        path: at,
        message: `long edge exceeds ${GALLERY_MAX_EDGE}px`,
      });
    }
  });
  if (listing.gallery.length > GALLERY_MAX_ITEMS) {
    errors.push({
      path: '$.gallery',
      message: `at most ${GALLERY_MAX_ITEMS} items`,
    });
  }
}

function sizeProblem(size, spec) {
  if (spec.width !== undefined && size.width !== spec.width) return true;
  if (spec.height !== undefined && size.height !== spec.height) return true;
  if (spec.minWidth !== undefined && size.width < spec.minWidth) return true;
  if (spec.minHeight !== undefined && size.height < spec.minHeight) return true;
  return false;
}

function describeSpec(spec) {
  return spec.width !== undefined
    ? `${spec.width}x${spec.height}`
    : `at least ${spec.minWidth}x${spec.minHeight}`;
}

function referencedAssets(listing) {
  const assets = [];
  for (const graphic of Object.values(listing.graphics ?? {})) {
    if (graphic?.file) assets.push({ file: graphic.file, spec: graphic });
  }
  for (const [device, shots] of Object.entries(listing.screenshots ?? {})) {
    const spec = listing.screenshotDevices?.[device];
    if (!spec || !Array.isArray(shots)) continue;
    for (const shot of shots) {
      for (const locale of LOCALES) {
        const file = shot?.files?.[locale];
        if (file) assets.push({ file, spec });
      }
    }
  }
  for (const item of Array.isArray(listing.gallery) ? listing.gallery : []) {
    if (item?.file) {
      assets.push({
        file: item.file,
        spec: { width: item.width, height: item.height },
        maxBytes: GALLERY_MAX_BYTES,
      });
    }
  }
  return assets;
}

const FORMAT_BY_EXTENSION = { '.png': 'png', '.jpg': 'jpeg', '.webp': 'webp' };

export function checkAssetFiles(
  listing,
  { root, requireAssets },
  errors,
  pending
) {
  for (const { file, spec, maxBytes } of referencedAssets(listing)) {
    const absolute = path.join(root, file);
    let contents;
    try {
      contents = readFileSync(absolute);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (requireAssets)
        errors.push({ path: file, message: 'asset is missing' });
      else pending.push(file);
      continue;
    }
    const bytes = contents.length;
    if (maxBytes !== undefined && bytes > maxBytes) {
      errors.push({
        path: file,
        message: `is ${bytes} bytes, limit ${maxBytes}`,
      });
    }
    const format = FORMAT_BY_EXTENSION[path.extname(file)];
    const size = readImageSize(contents);
    if (!size || size.format !== format) {
      errors.push({ path: file, message: `not a readable ${format} file` });
    } else if (sizeProblem(size, spec)) {
      errors.push({
        path: file,
        message: `is ${size.width}x${size.height}, expected ${describeSpec(spec)}`,
      });
    }
  }
}
