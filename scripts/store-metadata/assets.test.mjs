import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { GALLERY_MAX_BYTES } from './asset-checks.mjs';
import { readImageSize } from './image-size.mjs';
import { loadSchema, validateAll, validateListing } from './validate.mjs';

const schema = loadSchema();
const listings = Object.fromEntries(
  validateAll().map(({ slug, listing }) => [slug, listing])
);

function check(slug, mutate = () => {}, options = {}) {
  const copy = structuredClone(listings[slug]);
  mutate(copy);
  const result = validateListing(copy, {
    slug,
    schema,
    internalValues: [],
    ...options,
  });
  return {
    ...result,
    lines: result.errors.map(({ path: at, message }) => `${at}: ${message}`),
  };
}

function assertRejects(result, pattern) {
  assert.ok(
    result.lines.some((line) => pattern.test(line)),
    `expected an error matching ${pattern}, got:\n${result.lines.join('\n')}`
  );
}

function png(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpeg(width, height) {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x00,
  ];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}

function webp(width, height, padding = 0) {
  const buffer = Buffer.alloc(30 + padding);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function webpLossless(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer[20] = 0x2f;
  buffer.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return buffer;
}

test('image headers report PNG, JPEG and WebP dimensions', () => {
  assert.deepEqual(readImageSize(png(512, 512)), {
    format: 'png',
    width: 512,
    height: 512,
  });
  assert.deepEqual(readImageSize(jpeg(1320, 2868)), {
    format: 'jpeg',
    width: 1320,
    height: 2868,
  });
  assert.deepEqual(readImageSize(webp(589, 1280)), {
    format: 'webp',
    width: 589,
    height: 1280,
  });
  assert.deepEqual(readImageSize(webpLossless(1280, 720)), {
    format: 'webp',
    width: 1280,
    height: 720,
  });
  assert.equal(readImageSize(Buffer.from('not an image')), null);
});

test('every platform has a web gallery of at most six WebP items', () => {
  for (const [slug, listing] of Object.entries(listings)) {
    assert.ok(listing.gallery.length >= 1 && listing.gallery.length <= 6);
    for (const item of listing.gallery) {
      assert.ok(
        item.file.startsWith(`apps/mobile/store/screenshots/${slug}/web/`)
      );
      assert.ok(item.file.endsWith('.webp'));
      assert.ok(Math.max(item.width, item.height) <= 1280);
    }
  }
});

test('gallery count, extension, prefix, numbering and long edge are enforced', () => {
  assertRejects(
    check('ios', (l) => {
      l.gallery.push(structuredClone(l.gallery[0]));
    }),
    /gallery: must have at most 6 items/u
  );
  assertRejects(
    check('android', (l) => {
      l.gallery[0].file =
        'apps/mobile/store/screenshots/android/web/01-dashboard.png';
    }),
    /gallery\[0\]\.file: must be a \.webp file/u
  );
  assertRejects(
    check('macos', (l) => {
      l.gallery[1].file = 'apps/mobile/store/screenshots/ios/web/02-tasks.webp';
    }),
    /must start with apps\/mobile\/store\/screenshots\/macos\/web\//u
  );
  assertRejects(
    check('windows', (l) => {
      l.gallery[2].file =
        'apps/mobile/store/screenshots/windows/web/07-calendar.webp';
    }),
    /gallery\[2\]\.file: must be numbered 03/u
  );
  assertRejects(
    check('windows', (l) => {
      l.gallery[0].width = 1920;
    }),
    /gallery\[0\]\.width: must be <= 1280/u
  );
  assertRejects(
    check('ios', (l) => {
      delete l.gallery[0].alt.vi;
    }),
    /gallery\[0\]\.alt: missing required property "vi"/u
  );
});

test('screenshot files follow the per-locale layout for every device', () => {
  assertRejects(
    check('ios', (l) => {
      l.screenshots['iphone-6.9'].reverse();
    }),
    /expected apps\/mobile\/store\/screenshots\/ios\/iphone-6\.9\/en\/01-notes\.jpg/u
  );
  assertRejects(
    check('macos', (l) => {
      l.screenshots.mac[0].files.vi =
        'apps/mobile/store/screenshots/macos/mac/en/01-dashboard.jpg';
    }),
    /mac\[0\]\.files\.vi: expected .*\/mac\/vi\/01-dashboard\.jpg/u
  );
  assertRejects(
    check('android', (l) => {
      delete l.screenshots.tablet10;
    }),
    /missing device "tablet10"/u
  );
  assertRejects(
    check('android', (l) => {
      l.screenshots.phone[1].id = 'dashboard';
    }),
    /duplicate screenshot id/u
  );
});

test('present assets are checked for format, dimensions and gallery size', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'store-metadata-'));
  try {
    const listing = listings.android;
    const write = (file, data) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), data);
    };
    const [first, second, third] = listing.gallery;
    write(listing.graphics.icon.file, png(512, 512));
    write(listing.graphics.featureGraphic.file, png(1024, 512));
    write(listing.screenshots.phone[0].files.en, jpeg(1080, 1920));
    write(listing.screenshots.phone[0].files.vi, png(1080, 1920));
    write(first.file, webp(first.width, first.height));
    write(second.file, webp(second.width, second.height, GALLERY_MAX_BYTES));
    write(third.file, webp(1280, 1280));

    const result = check('android', undefined, { root });
    assert.equal(result.lines.length, 4, result.lines.join('\n'));
    assertRejects(result, /feature-graphic.*is 1024x512, expected 1024x500/u);
    assertRejects(result, /vi\/01-dashboard\.jpg: not a readable jpeg/u);
    assertRejects(result, /web\/02-tasks\.webp: is \d+ bytes, limit 150000/u);
    assertRejects(
      result,
      /web\/03-calendar\.webp: is 1280x1280, expected 720x1280/u
    );
    assert.ok(result.pending.length > 0);

    const strict = check('android', undefined, { root, requireAssets: true });
    assertRejects(strict, /asset is missing/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
