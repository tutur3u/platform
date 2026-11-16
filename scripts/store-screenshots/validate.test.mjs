import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { headlineFor, planScreens } from './captions.mjs';
import { gallerySources } from './web-gallery.mjs';
import { readImageInfo } from './image-info.mjs';
import { toOpaqueRgbPng } from './png-rgb.mjs';
import { GRAPHIC_TARGETS, SCREENSHOT_TARGETS } from './specs.mjs';
import {
  checkGraphic,
  checkScreenshot,
  checkWebImage,
  validateStoreImages,
} from './validate.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** A JPEG header carrying only SOI and a baseline frame segment. */
function jpegHeader(width, height, channels = 3) {
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    8 + channels * 3,
    8,
    0,
    0,
    0,
    0,
    channels,
  ]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    sof,
    Buffer.alloc(channels * 3),
  ]);
}

/** A PNG signature and IHDR chunk only. */
function pngHeader(width, height, colorType) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    Buffer.alloc(4),
  ]);
}

/** A real 2x1 PNG with the given colour type (2 = RGB, 6 = RGBA). */
function png(colorType, pixels) {
  const channels = colorType === 6 ? 4 : 3;
  const width = pixels.length / channels;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    // CRC is not checked by the readers under test.
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, ...pixels]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('accepts a JPEG at the exact store size', () => {
  assert.deepEqual(
    checkScreenshot(
      'ios/iphone-6.9/en/01-dashboard.jpg',
      jpegHeader(1320, 2868)
    ),
    []
  );
  assert.deepEqual(
    checkScreenshot(
      'windows/desktop/vi/08-notes.png',
      pngHeader(1920, 1080, 2)
    ),
    []
  );
  assert.match(
    checkScreenshot(
      'windows/desktop/vi/08-notes.png',
      pngHeader(1920, 1080, 6)
    )[0],
    /alpha/
  );
  assert.match(
    checkScreenshot(
      'windows/desktop/vi/08-notes.jpg',
      jpegHeader(1920, 1080)
    )[0],
    /are \.png/
  );
  assert.match(
    checkScreenshot(
      'ios/iphone-6.9/en/01-dashboard.png',
      pngHeader(1320, 2868, 2)
    )[0],
    /are \.jpg/
  );
});

test('rejects wrong sizes, CMYK, PNG data and bad names', () => {
  assert.match(
    checkScreenshot(
      'ios/iphone-6.9/en/01-dashboard.jpg',
      jpegHeader(1290, 2796)
    )[0],
    /expected 1320x2868/
  );
  assert.match(
    checkScreenshot(
      'android/phone/en/01-dashboard.jpg',
      jpegHeader(1080, 1920, 4)
    )[0],
    /4 channels/
  );
  assert.match(
    checkScreenshot('android/phone/en/01-dashboard.jpg', png(2, [1, 2, 3]))[0],
    /not a JPEG/
  );
  assert.match(
    checkScreenshot(
      'android/phone/en/dashboard.jpg',
      jpegHeader(1080, 1920)
    )[0],
    /name must be/
  );
  assert.match(
    checkScreenshot('tvos/tv/en/01-dashboard.jpg', jpegHeader(1920, 1080))[0],
    /unknown target/
  );
});

test('every target is a supported store size', () => {
  for (const target of SCREENSHOT_TARGETS) {
    assert.ok(
      Number.isInteger(target.width) && Number.isInteger(target.height)
    );
  }
  const portrait = SCREENSHOT_TARGETS.filter(
    (t) => t.frame === 'phone' || t.frame === 'tablet'
  );
  assert.ok(portrait.every((t) => t.height > t.width));
});

test('flattens alpha into an opaque RGB PNG', () => {
  const rgba = png(6, [255, 0, 0, 255, 0, 0, 0, 0]);
  assert.equal(readImageInfo(rgba).alpha, true);
  const rgb = toOpaqueRgbPng(rgba);
  const info = readImageInfo(rgb);
  assert.deepEqual(
    [info.format, info.width, info.height, info.alpha, info.channels],
    ['png', 2, 1, false, 3]
  );
  const graphic = { ...GRAPHIC_TARGETS[0], width: 2, height: 1 };
  assert.deepEqual(checkGraphic(graphic, rgb), []);
  assert.match(checkGraphic(graphic, rgba)[0], /alpha/);
});

test('uses metadata captions, falling back for sentence-length ones', () => {
  assert.equal(
    headlineFor('Ask Mira by text or voice', 'en', 'assistant'),
    'Ask Mira by text or voice'
  );
  assert.equal(
    headlineFor(
      'See today’s tasks, events and workspace activity in one place, every day.',
      'en',
      'dashboard'
    ),
    'Your day at a glance'
  );
  const target = SCREENSHOT_TARGETS.find((t) => t.store === 'windows');
  const planned = planScreens(null, target, 'vi');
  assert.equal(planned.length, 8);
  assert.equal(
    planned[6].file,
    'apps/mobile/store/screenshots/windows/desktop/vi/07-time-tracker.png'
  );
  const metadata = {
    screenshots: {
      desktop: [
        {
          id: 'notes',
          files: { en: 'x/en/notes.png', vi: 'x/vi/notes.png' },
          caption: { en: 'Short', vi: 'Ngắn' },
        },
      ],
    },
  };
  assert.deepEqual(planScreens(metadata, target, 'vi'), [
    { id: 'notes', file: 'x/vi/notes.png', headline: 'Ngắn' },
  ]);
});

test('reports missing listed screenshots once any are committed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-shots-'));
  try {
    const shots = path.join(
      root,
      'apps/mobile/store/screenshots/android/phone/en'
    );
    const meta = path.join(root, 'apps/mobile/store/metadata');
    fs.mkdirSync(shots, { recursive: true });
    fs.mkdirSync(meta, { recursive: true });
    fs.writeFileSync(
      path.join(shots, '01-dashboard.jpg'),
      jpegHeader(1080, 1920)
    );
    const listed = (id) => ({
      id,
      files: {
        en: `apps/mobile/store/screenshots/android/phone/en/0${id === 'tasks' ? 2 : 1}-${id}.jpg`,
      },
      caption: { en: id },
    });
    fs.writeFileSync(
      path.join(meta, 'android.json'),
      JSON.stringify({
        screenshots: { phone: [listed('dashboard'), listed('tasks')] },
      })
    );
    fs.writeFileSync(
      path.join(meta, 'ios.json'),
      JSON.stringify({
        screenshots: {
          'iphone-6.9': [
            {
              id: 'notes',
              files: {
                en: 'apps/mobile/store/screenshots/ios/iphone-6.9/en/01-notes.jpg',
              },
            },
          ],
        },
      })
    );
    const { problems, count } = validateStoreImages(root);
    assert.equal(count, 1);
    // iOS has nothing committed yet, so only the started Android set is held complete.
    assert.deepEqual(problems, [
      'apps/mobile/store/screenshots/android/phone/en/02-tasks.jpg: listed in metadata but missing',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** A lossy WebP header (VP8 chunk) with the given size and total length. */
function webp(width, height, length = 64) {
  const buffer = Buffer.alloc(length);
  buffer.write('RIFF', 0, 'latin1');
  buffer.writeUInt32LE(length - 8, 4);
  buffer.write('WEBPVP8 ', 8, 'latin1');
  buffer.set([0x9d, 0x01, 0x2a], 23);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

test('accepts web gallery WebP within the edge and byte caps', () => {
  const { problems, info } = checkWebImage(
    'ios/web/01-dashboard.webp',
    webp(589, 1280)
  );
  assert.deepEqual(problems, []);
  assert.deepEqual([info.format, info.width, info.height], ['webp', 589, 1280]);
});

test('rejects oversized, heavy or misnamed web gallery files', () => {
  assert.match(
    checkWebImage('macos/web/01-dashboard.webp', webp(1440, 900)).problems[0],
    /long edge/
  );
  assert.match(
    checkWebImage('android/web/02-tasks.webp', webp(720, 1280, 160 * 1024))
      .problems[0],
    /bytes exceeds/
  );
  assert.match(
    checkWebImage('android/web/02-tasks.webp', jpegHeader(720, 1280))
      .problems[0],
    /not a WebP/
  );
  assert.match(
    checkWebImage('ios/web/tasks.webp', webp(10, 10)).problems[0],
    /name must be/
  );
  assert.match(
    checkWebImage('tvos/web/01-tasks.webp', webp(10, 10)).problems[0],
    /unknown platform/
  );
});

test('checks the web gallery count and manifest sizes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-web-'));
  try {
    const web = path.join(root, 'apps/mobile/store/screenshots/windows/web');
    fs.mkdirSync(web, { recursive: true });
    const items = [];
    for (let i = 1; i <= 7; i++) {
      const name = `0${i}-shot${i}.webp`;
      fs.writeFileSync(path.join(web, name), webp(1280, 720));
      items.push({
        id: `shot${i}`,
        file: `apps/mobile/store/screenshots/windows/web/${name}`,
        width: 1280,
        height: i === 2 ? 700 : 720,
      });
    }
    items.push({
      id: 'gone',
      file: 'apps/mobile/store/screenshots/windows/web/09-gone.webp',
      width: 1,
      height: 1,
    });
    fs.writeFileSync(
      path.join(web, 'manifest.json'),
      JSON.stringify({ items })
    );
    const { problems } = validateStoreImages(root);
    assert.deepEqual(problems, [
      'windows/web: 7 images, at most 6',
      'windows/web/02-shot2.webp: manifest says 1280x700, file is 1280x720',
      'windows/web/09-gone.webp: in manifest.json but missing',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('committed store images pass', () => {
  const { problems } = validateStoreImages(REPO_ROOT);
  assert.deepEqual(problems, []);
});

test('web gallery follows the listing gallery, else the first screenshots', () => {
  const shots = [
    '01-dashboard.png',
    '05-finance.png',
    '07-time-tracker.png',
    '08-notes.png',
    'notes.txt',
  ];
  assert.deepEqual(
    gallerySources(shots, [
      { file: 'apps/mobile/store/screenshots/windows/web/01-dashboard.webp' },
      {
        file: 'apps/mobile/store/screenshots/windows/web/05-time-tracker.webp',
      },
    ]),
    [
      ['01-dashboard.png', '01-dashboard.webp'],
      ['07-time-tracker.png', '05-time-tracker.webp'],
    ]
  );
  assert.deepEqual(gallerySources(shots, null).length, 4);
  assert.throws(
    () => gallerySources(shots, [{ file: 'x/web/02-tasks.webp' }]),
    /No screenshot/
  );
});
