import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import {
  checkColorProfile,
  classifyIcc,
  readColorProfile,
} from './color-profile.mjs';
import { LOCALES, SCREENSHOT_TARGETS } from './specs.mjs';
import {
  TARGET_RULES,
  checkBytes,
  checkCounts,
  checkGeometry,
} from './store-rules.mjs';
import { checkScreenshot } from './validate.mjs';

/** A minimal ICC profile whose `desc` tag holds [name] (ICC v2 layout). */
function icc(name, space = 'RGB ') {
  const text = Buffer.from(`${name}\0`, 'latin1');
  const desc = Buffer.concat([
    Buffer.from('desc\0\0\0\0', 'latin1'),
    Buffer.from([0, 0, 0, text.length]),
    text,
  ]);
  const header = Buffer.alloc(128);
  header.write(space, 16, 'latin1');
  const table = Buffer.alloc(16);
  table.writeUInt32BE(1, 0);
  table.write('desc', 4, 'latin1');
  table.writeUInt32BE(144, 8);
  table.writeUInt32BE(desc.length, 12);
  return Buffer.concat([header, table, desc]);
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}

/** A PNG of the given size and colour type with [extra] chunks before IDAT. */
function png(width, height, extra = [], colorType = 2) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...extra,
    pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const iccpChunk = (name) =>
  pngChunk(
    'iCCP',
    Buffer.concat([Buffer.from('icc\0\0'), zlib.deflateSync(icc(name))])
  );

/** A JPEG header with a frame segment and optional ICC APP2 segment. */
function jpeg(width, height, { channels = 3, profile = null } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (profile) {
    const body = Buffer.concat([
      Buffer.from('ICC_PROFILE\0', 'latin1'),
      Buffer.from([1, 1]),
      profile,
    ]);
    const head = Buffer.from([0xff, 0xe2, 0, 0]);
    head.writeUInt16BE(body.length + 2, 2);
    parts.push(head, body);
  }
  const sof = Buffer.from([
    0xff,
    0xc0,
    0,
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
  parts.push(sof, Buffer.alloc(channels * 3));
  return Buffer.concat(parts);
}

test('ICC profiles: only RGB profiles named sRGB pass', () => {
  assert.equal(classifyIcc(icc('sRGB IEC61966-2.1')).kind, 'srgb');
  assert.equal(classifyIcc(icc('Display P3')).kind, 'other');
  assert.equal(classifyIcc(icc('Adobe RGB (1998)')).kind, 'other');
  assert.equal(classifyIcc(icc('sRGB', 'CMYK')).kind, 'other');
});

test('PNG and JPEG colour profiles are read from their headers', () => {
  assert.equal(readColorProfile(png(2, 2)).kind, 'untagged');
  assert.equal(
    readColorProfile(png(2, 2, [pngChunk('sRGB', Buffer.from([0]))])).kind,
    'srgb'
  );
  assert.equal(
    readColorProfile(png(2, 2, [iccpChunk('sRGB IEC61966-2.1')])).kind,
    'srgb'
  );
  assert.equal(
    readColorProfile(png(2, 2, [iccpChunk('Display P3')])).name,
    'Display P3'
  );
  assert.equal(readColorProfile(jpeg(2, 2)).kind, 'untagged');
  assert.equal(
    readColorProfile(jpeg(2, 2, { profile: icc('sRGB') })).kind,
    'srgb'
  );
  assert.equal(
    readColorProfile(jpeg(2, 2, { profile: icc('Display P3') })).kind,
    'other'
  );
  assert.equal(readColorProfile(Buffer.from('RIFF....WEBP')), null);
  assert.match(
    checkColorProfile('a.jpg', jpeg(2, 2, { profile: icc('Display P3') }))[0],
    /"Display P3" is not sRGB/
  );
});

test('screenshots with a wide-gamut profile or the wrong channels fail', () => {
  const name = 'ios/iphone-6.9/en/01-dashboard.jpg';
  assert.deepEqual(
    checkScreenshot(name, jpeg(1320, 2868, { profile: icc('sRGB') })),
    []
  );
  assert.match(
    checkScreenshot(name, jpeg(1320, 2868, { profile: icc('Display P3') }))[0],
    /not sRGB/
  );
  assert.match(
    checkScreenshot(name, jpeg(1320, 2868, { channels: 1 }))[0],
    /1 channels, expected RGB/
  );
  assert.match(
    checkScreenshot(name, jpeg(1320, 2868, { channels: 4 }))[0],
    /4 channels, expected RGB/
  );
  assert.match(
    checkScreenshot(
      'windows/desktop/en/01-dashboard.png',
      png(1920, 1080, [iccpChunk('Display P3')])
    )[0],
    /not sRGB/
  );
});

test('Google Play geometry: sides, aspect and large-screen ratios', () => {
  const phone = TARGET_RULES['android/phone'];
  assert.deepEqual(checkGeometry('p', 1080, 1920, phone), []);
  assert.match(checkGeometry('p', 300, 1920, phone)[0], /width 300/);
  assert.match(checkGeometry('p', 1080, 3900, phone)[0], /height 3900/);
  assert.match(checkGeometry('p', 1080, 2700, phone)[0], /aspect 2\.50:1/);
  const tablet = TARGET_RULES['android/tablet10'];
  assert.deepEqual(checkGeometry('t', 1440, 2560, tablet), []);
  assert.deepEqual(checkGeometry('t', 2560, 1440, tablet), []);
  assert.match(checkGeometry('t', 1600, 2560, tablet)[0], /9:16 or 16:9/);
  assert.match(checkGeometry('t', 1000, 1778, tablet)[0], /width 1000/);
  assert.deepEqual(checkGeometry('x', 1, 1, undefined), []);
});

test('byte caps apply per store rule', () => {
  const phone = TARGET_RULES['android/phone'];
  assert.deepEqual(checkBytes('p', 8 * 1024 * 1024, phone), []);
  assert.match(checkBytes('p', 8 * 1024 * 1024 + 1, phone)[0], /store cap/);
  assert.deepEqual(
    checkBytes('i', 99_000_000, TARGET_RULES['ios/ipad-13']),
    []
  );
});

const shots = (target, locale, count) =>
  Array.from(
    { length: count },
    (_, i) => `${target}/${locale}/${String(i + 1).padStart(2, '0')}-s${i}.jpg`
  );

/** Every target of one store, in every locale, with [count] screenshots each. */
const fullStore = (store, count) =>
  Object.keys(TARGET_RULES)
    .filter((target) => target.startsWith(`${store}/`))
    .flatMap((target) =>
      LOCALES.flatMap((locale) => shots(target, locale, count))
    );

const without = (files, prefix) =>
  files.filter((file) => !file.startsWith(prefix));

const replaceTarget = (files, target, replacement) => [
  ...without(files, `${target}/`),
  ...replacement,
];

test('counts per device class and locale stay within store limits', () => {
  assert.deepEqual(
    checkCounts([...fullStore('ios', 10), ...fullStore('android', 4)]),
    []
  );
  assert.deepEqual(
    checkCounts(
      replaceTarget(fullStore('ios', 10), 'ios/iphone-6.9', [
        ...shots('ios/iphone-6.9', 'en', 11),
        ...shots('ios/iphone-6.9', 'vi', 11),
      ])
    ),
    [
      'ios/iphone-6.9/en: 11 screenshots, expected 1-10',
      'ios/iphone-6.9/vi: 11 screenshots, expected 1-10',
    ]
  );
  assert.deepEqual(
    checkCounts(
      replaceTarget(fullStore('android', 4), 'android/phone', [
        ...shots('android/phone', 'en', 1),
        ...shots('android/phone', 'vi', 1),
      ])
    ),
    [
      'android/phone/en: 1 screenshots, expected 2-8',
      'android/phone/vi: 1 screenshots, expected 2-8',
    ]
  );
  assert.deepEqual(
    checkCounts(
      replaceTarget(fullStore('android', 4), 'android/tablet7', [
        ...shots('android/tablet7', 'en', 3),
        ...shots('android/tablet7', 'vi', 3),
      ])
    ),
    [
      'android/tablet7/en: 3 screenshots, expected 4-8',
      'android/tablet7/vi: 3 screenshots, expected 4-8',
    ]
  );
});

test('a store with screenshots needs every locale for every target', () => {
  assert.deepEqual(
    checkCounts(without(fullStore('ios', 3), 'ios/ipad-13/vi/')),
    ['ios/ipad-13/vi: required locale has no screenshots']
  );
  assert.deepEqual(
    checkCounts(without(fullStore('macos', 3), 'macos/mac/en/')),
    ['macos/mac/en: required locale has no screenshots']
  );
  assert.deepEqual(
    checkCounts(
      replaceTarget(fullStore('android', 4), 'android/phone', [
        ...shots('android/phone', 'en', 4),
      ])
    ),
    ['android/phone/vi: required locale has no screenshots']
  );
});

test('a store with screenshots needs every required target', () => {
  assert.deepEqual(
    checkCounts(without(fullStore('ios', 3), 'ios/iphone-6.3/')),
    ['ios/iphone-6.3: required target has no screenshots']
  );
  assert.deepEqual(
    checkCounts(without(fullStore('android', 4), 'android/tablet10/')),
    ['android/tablet10: required target has no screenshots']
  );
  // A store with no screenshots yet is not required to ship any.
  assert.deepEqual(checkCounts(fullStore('windows', 1)), []);
  assert.deepEqual(checkCounts([]), []);
});

test('iPhone Duo screenshots take exact outer and inner sizes', () => {
  assert.deepEqual(
    checkScreenshot(
      'ios/iphone-duo-outer/en/01-dashboard.jpg',
      jpeg(1398, 2034)
    ),
    []
  );
  assert.deepEqual(
    checkScreenshot(
      'ios/iphone-duo-inner/vi/01-dashboard.jpg',
      jpeg(2853, 2007)
    ),
    []
  );
  assert.match(
    checkScreenshot(
      'ios/iphone-duo-inner/en/01-dashboard.jpg',
      jpeg(2007, 2853)
    )[0],
    /expected 2853x2007/
  );
  assert.deepEqual(checkCounts(fullStore('ios', 4)), []);
});

test('English and Vietnamese must ship the same screenshots', () => {
  assert.deepEqual(
    checkCounts(
      replaceTarget(fullStore('ios', 3), 'ios/iphone-6.9', [
        ...shots('ios/iphone-6.9', 'en', 3),
        ...shots('ios/iphone-6.9', 'vi', 2),
      ])
    ),
    ['ios/iphone-6.9: en has 3, vi has 2; every locale must ship the same set']
  );
  assert.deepEqual(
    checkCounts(
      replaceTarget(fullStore('ios', 3), 'ios/iphone-6.9', [
        'ios/iphone-6.9/en/01-a.jpg',
        'ios/iphone-6.9/vi/01-b.jpg',
      ])
    ),
    ['ios/iphone-6.9: en has 1, vi has 1; every locale must ship the same set']
  );
});

test('every store target has rules that its own size satisfies', () => {
  for (const target of SCREENSHOT_TARGETS) {
    const key = `${target.store}/${target.device}`;
    const rules = TARGET_RULES[key];
    assert.ok(rules, `${key} has no store rules`);
    assert.deepEqual(
      checkGeometry(key, target.width, target.height, rules),
      []
    );
    assert.ok(target.maxBytes <= (rules.maxBytes ?? Infinity), key);
  }
  for (const key of Object.keys(TARGET_RULES)) {
    assert.ok(
      SCREENSHOT_TARGETS.some((t) => `${t.store}/${t.device}` === key),
      `${key} has rules but no target`
    );
  }
});
