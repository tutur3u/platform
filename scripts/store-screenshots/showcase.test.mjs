import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readImageInfo } from './image-info.mjs';
import {
  checkShowcaseItem,
  expectedKeys,
  validateShowcase,
} from './showcase-checks.mjs';
import {
  SHOWCASE_FRAMES,
  showcaseHtml,
  showcaseLayout,
} from './showcase-template.mjs';
import { compareItems, encodeToBudget, previewFile } from './showcase.mjs';
import { SHOWCASE, SHOWCASE_DEVICES } from './specs.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** A WebP header (VP8X) with the alpha flag set or clear. */
function webp(width, height, { alpha = true, length = 64 } = {}) {
  const buffer = Buffer.alloc(length);
  buffer.write('RIFF', 0, 'latin1');
  buffer.writeUInt32LE(length - 8, 4);
  buffer.write('WEBPVP8X', 8, 'latin1');
  buffer[20] = alpha ? 0x10 : 0;
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

/** An AVIF header: `ftypavif`, an `ispe` size box and an optional alpha URN. */
function avif(width, height, { alpha = true, length = 160 } = {}) {
  const buffer = Buffer.alloc(length);
  buffer.writeUInt32BE(24, 0);
  buffer.write('ftypavif', 4, 'latin1');
  buffer.write('ispe', 40, 'latin1');
  buffer.writeUInt32BE(width, 48);
  buffer.writeUInt32BE(height, 52);
  if (alpha)
    buffer.write('urn:mpeg:mpegB:cicp:systems:auxiliary:alpha', 80, 'latin1');
  return buffer;
}

function item(overrides = {}) {
  const base = {
    screen: 'tasks',
    device: 'iphone',
    theme: 'light',
    locale: 'en',
    width: 613,
    height: 1279,
    avifBytes: 160,
    webpBytes: 64,
  };
  const merged = { ...base, ...overrides };
  merged.avif ??= previewFile(
    merged.screen,
    merged.device,
    merged.theme,
    merged.locale,
    'avif'
  );
  merged.webp ??= previewFile(
    merged.screen,
    merged.device,
    merged.theme,
    merged.locale,
    'webp'
  );
  return merged;
}

const files = (entry, avifBuffer, webpBuffer) => (file) =>
  file === entry.avif ? avifBuffer : file === entry.webp ? webpBuffer : null;

test('reads AVIF size and alpha from the header', () => {
  assert.deepEqual(readImageInfo(avif(613, 1279)), {
    format: 'avif',
    width: 613,
    height: 1279,
    channels: 4,
    alpha: true,
  });
  assert.equal(readImageInfo(avif(10, 10, { alpha: false })).alpha, false);
});

test('showcase devices keep to their long-edge caps and the brief', () => {
  assert.deepEqual(Object.keys(SHOWCASE_DEVICES), [
    'iphone',
    'ipad',
    'ipad-landscape',
    'mac',
    'duo-folded',
    'duo-unfolded',
  ]);
  const edge = {
    phone: 1280,
    tablet: 1600,
    'mac-window': 1600,
    foldable: 1600,
  };
  for (const [name, device] of Object.entries(SHOWCASE_DEVICES)) {
    assert.equal(device.maxEdge, edge[device.frame], name);
    const [w, h] = device.logical;
    const layout = showcaseLayout(device, w * device.ratio, h * device.ratio);
    assert.ok(Math.max(layout.width, layout.height) <= device.maxEdge, name);
    assert.ok(
      Math.max(layout.width, layout.height) >= device.maxEdge - 12,
      name
    );
    assert.equal(layout.deviceWidth, layout.screenWidth + 2 * layout.bezel);
    assert.equal(layout.height, layout.deviceHeight + 2 * layout.margin, name);
  }
  assert.deepEqual(SHOWCASE_DEVICES.iphone.logical, [393, 852]);
  assert.deepEqual(SHOWCASE_DEVICES.ipad.logical, [1024, 1366]);
  assert.deepEqual(SHOWCASE_DEVICES['ipad-landscape'].logical, [1366, 1024]);
  assert.deepEqual(SHOWCASE_DEVICES.mac.logical, [1512, 982]);
  assert.deepEqual(SHOWCASE_DEVICES['duo-folded'].logical, [466, 678]);
  assert.deepEqual(SHOWCASE_DEVICES['duo-unfolded'].logical, [951, 669]);
  assert.ok(SHOWCASE.screens.length <= 6);
  assert.deepEqual(SHOWCASE.locales, ['en', 'vi']);
  assert.deepEqual(SHOWCASE.themes, ['light', 'dark']);
});

test('showcase sizes match the Flutter capture targets', () => {
  const dart = fs.readFileSync(
    path.join(
      REPO_ROOT,
      'apps/mobile/test/store_screenshots/store_screenshot_app.dart'
    ),
    'utf8'
  );
  for (const [name, device] of Object.entries(SHOWCASE_DEVICES)) {
    const [w, h] = device.logical;
    assert.ok(
      dart.includes(`('${name}', Size(${w}, ${h}), ${device.ratio}.0)`),
      `${name} differs from showcaseDevices`
    );
  }
});

test('the preview page is transparent and draws the frame without text', () => {
  const layout = showcaseLayout(SHOWCASE_DEVICES.mac, 3024, 1964);
  const html = showcaseHtml({
    layout,
    theme: 'dark',
    rawUrl: 'data:image/png;base64,AA==',
    barColor: 'rgb(0,0,0)',
  });
  assert.match(html, /html,body\{[^}]*background:transparent/);
  assert.match(html, /#ff5f57/);
  assert.doesNotMatch(html, /<h1/);
  const duo = showcaseHtml({
    layout: showcaseLayout(SHOWCASE_DEVICES['duo-unfolded'], 2853, 2007),
    theme: 'light',
    rawUrl: 'data:image/png;base64,AA==',
    barColor: 'rgb(0,0,0)',
  });
  assert.match(duo, /class="seam"/);
  assert.deepEqual(Object.keys(SHOWCASE_FRAMES).sort(), [
    'foldable',
    'mac-window',
    'phone',
    'tablet',
  ]);
});

test('encodeToBudget takes the best quality that fits', async () => {
  const sizes = { 80: 500, 60: 300, 40: 100 };
  const encode = async (quality) => Buffer.alloc(sizes[quality]);
  const result = await encodeToBudget(encode, [80, 60, 40], 300);
  assert.equal(result.quality, 60);
  assert.equal((await encodeToBudget(encode, [80, 60, 40], 1000)).quality, 80);
  await assert.rejects(
    encodeToBudget(encode, [80, 60, 40], 50),
    /Cannot fit 50 bytes/
  );
});

test('manifest items sort by screen, device, theme and locale', () => {
  const a = item({ screen: 'tasks', device: 'mac', theme: 'dark' });
  const b = item({ screen: 'tasks', device: 'iphone', theme: 'dark' });
  const c = item({ screen: 'task-detail', device: 'mac', theme: 'light' });
  const d = item({
    screen: 'tasks',
    device: 'iphone',
    theme: 'light',
    locale: 'vi',
  });
  assert.deepEqual([a, b, c, d].sort(compareItems), [d, b, a, c]);
});

test('an item passes with transparent files inside the budgets', () => {
  const entry = item();
  assert.deepEqual(
    checkShowcaseItem(entry, files(entry, avif(613, 1279), webp(613, 1279))),
    []
  );
});

test('items fail on size, alpha, bytes, budget and missing files', () => {
  const entry = item();
  const ok = [avif(613, 1279), webp(613, 1279)];
  const problems = (overrides, avifBuffer = ok[0], webpBuffer = ok[1]) =>
    checkShowcaseItem(
      { ...entry, ...overrides },
      files({ ...entry, ...overrides }, avifBuffer, webpBuffer)
    ).join('\n');
  assert.match(
    problems({ width: 1400, height: 1400 }, avif(1400, 1400), webp(1400, 1400)),
    /exceeds 1280 px/
  );
  assert.match(
    problems({}, avif(600, 1279), ok[1]),
    /600x1279, manifest says 613x1279/
  );
  assert.match(
    problems({}, avif(613, 1279, { alpha: false })),
    /no alpha channel/
  );
  assert.match(
    problems({}, ok[0], webp(613, 1279, { alpha: false })),
    /no alpha channel/
  );
  assert.match(problems({ avifBytes: 99 }), /160 bytes, manifest says 99/);
  assert.match(
    problems(
      { avifBytes: 90 * 1024 + 1, webpBytes: 140 * 1024 + 1 },
      avif(613, 1279, { length: 90 * 1024 + 1 }),
      webp(613, 1279, { length: 140 * 1024 + 1 })
    ),
    /exceeds 92160[\s\S]*exceeds 143360/
  );
  assert.match(
    checkShowcaseItem(entry, () => null).join('\n'),
    /iphone-light-en\.avif: missing/
  );
  assert.match(problems({ avif: 'x/y.avif' }), /avif path x\/y\.avif/);
  assert.match(problems({ device: 'watch' }), /unknown device watch/);
  assert.match(problems({ avifBytes: undefined }), /no avifBytes/);
});

test('committed previews pass the manifest and budget checks', () => {
  const { problems, count } = validateShowcase(REPO_ROOT);
  assert.deepEqual(problems, []);
  assert.equal(count, expectedKeys().length);
  assert.equal(count, 6 * 6 * 2 * 2);
});
