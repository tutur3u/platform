// Web gallery derivatives for /roadmap: small WebP copies of the first EN
// composed screenshots of one device per platform, plus a manifest with each
// file's pixel size for the metadata `gallery` entries.
import fs from 'node:fs';
import path from 'node:path';
import { SCREENSHOT_ROOT, WEB_GALLERY, webGalleryPath } from './specs.mjs';

const QUALITIES = [0.86, 0.8, 0.74, 0.68, 0.6, 0.52, 0.44];

// Scales the image to the long-edge cap and lowers quality until the file
// fits the byte cap. Runs in the page, where Chromium encodes WebP.
async function encodeInPage({ src, maxEdge, maxBytes, qualities }) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of qualities) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP');
    if (blob.size <= maxBytes) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return { base64: btoa(binary), width: canvas.width, height: canvas.height, quality };
    }
  }
  throw new Error(`Cannot fit ${maxBytes} bytes`);
}

/** Writes `<platform>/web/NN-<id>.webp` and `manifest.json`; returns entries. */
export async function writeWebGallery(page, outRoot) {
  const written = {};
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const [platform, device] of Object.entries(WEB_GALLERY.sources)) {
    const sourceDir = path.join(outRoot, SCREENSHOT_ROOT, platform, device, WEB_GALLERY.locale);
    if (!fs.existsSync(sourceDir)) continue;
    const sources = fs
      .readdirSync(sourceDir)
      .filter((name) => /^\d{2}-[a-z][a-z0-9-]*\.(jpg|png)$/.test(name))
      .sort()
      .slice(0, WEB_GALLERY.maxPerPlatform);
    const webDir = path.join(outRoot, SCREENSHOT_ROOT, platform, 'web');
    fs.rmSync(webDir, { recursive: true, force: true });
    fs.mkdirSync(webDir, { recursive: true });
    const items = [];
    for (const name of sources) {
      const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const src = `data:${mime};base64,${fs.readFileSync(path.join(sourceDir, name)).toString('base64')}`;
      const encoded = await page.evaluate(encodeInPage, {
        src,
        maxEdge: WEB_GALLERY.maxLongEdge,
        maxBytes: WEB_GALLERY.maxBytes,
        qualities: QUALITIES,
      });
      const fileName = name.replace(/\.(jpg|png)$/, '.webp');
      const bytes = Buffer.from(encoded.base64, 'base64');
      fs.writeFileSync(path.join(webDir, fileName), bytes);
      items.push({
        id: fileName.slice(3, -'.webp'.length),
        file: webGalleryPath(platform, fileName),
        width: encoded.width,
        height: encoded.height,
        bytes: bytes.length,
      });
    }
    const manifest = { source: `${platform}/${device}/${WEB_GALLERY.locale}`, items };
    fs.writeFileSync(path.join(webDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    written[platform] = items;
  }
  return written;
}
