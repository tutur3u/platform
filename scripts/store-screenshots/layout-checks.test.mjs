import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkCaptionLayout,
  checkCardLayout,
  checkLayoutReport,
  LAYOUT_REPORT_FILE,
} from './layout-checks.mjs';
import {
  readLayoutReport,
  reportEntry,
  writeLayoutReport,
} from './layout-report.mjs';
import { SCREENSHOT_TARGETS } from './specs.mjs';
import { screenshotHtml, screenshotSpec } from './template.mjs';
import { LAYOUTS } from './template-layout.mjs';

const PHONE = { frame: 'phone' };
const TABLET = { frame: 'tablet' };

/** A well-placed caption on a 1000x2000 canvas. */
function entry(overrides = {}) {
  return {
    canvas: { width: 1000, height: 2000 },
    caption: { x: 100, y: 200, width: 800, height: 400 },
    card: { x: 60, y: 700, width: 880, height: 1400 },
    headline: { fontSize: 120, lines: 2 },
    sha256: 'aa',
    ...overrides,
  };
}

test('accepts a caption inside the safe area', () => {
  assert.deepEqual(checkCaptionLayout('a.jpg', entry(), PHONE), []);
});

test('flags a caption closer than 5% to any edge', () => {
  const cases = [
    [{ x: 49, y: 200, width: 800, height: 400 }, 'left'],
    [{ x: 100, y: 200, width: 851, height: 400 }, 'right'],
    [{ x: 100, y: 99, width: 800, height: 400 }, 'top'],
    [{ x: 100, y: 1500, width: 800, height: 401 }, 'bottom'],
  ];
  for (const [caption, edge] of cases) {
    const problems = checkCaptionLayout('a.jpg', entry({ caption }), PHONE);
    assert.equal(problems.length, 1, edge);
    assert.match(problems[0], new RegExp(`from the ${edge} edge`));
  }
});

test('flags a headline over two lines', () => {
  const [problem] = checkCaptionLayout(
    'a.jpg',
    entry({ headline: { fontSize: 120, lines: 3 } }),
    PHONE
  );
  assert.match(problem, /runs 3 lines, at most 2/);
});

test('holds phones to 4.2% of the width and large canvases to 2.6%', () => {
  const small = entry({ headline: { fontSize: 41, lines: 2 } });
  assert.match(
    checkCaptionLayout('a.jpg', small, PHONE)[0],
    /needs at least 42 px \(4\.2%/
  );
  assert.deepEqual(checkCaptionLayout('a.jpg', small, TABLET), []);
  const tiny = entry({ headline: { fontSize: 25, lines: 2 } });
  assert.match(
    checkCaptionLayout('a.jpg', tiny, TABLET)[0],
    /needs at least 26 px \(2\.6%/
  );
});

test('rejects an incomplete entry', () => {
  assert.match(
    checkCaptionLayout('a.jpg', { canvas: { width: 1, height: 1 } }, PHONE)[0],
    /incomplete/
  );
  assert.match(checkCaptionLayout('a.jpg', undefined, PHONE)[0], /incomplete/);
});

test('checks the whole report against the screenshots', () => {
  const shots = new Map([
    ['a.jpg', { width: 1000, height: 2000, target: PHONE, sha256: 'aa' }],
    ['b.jpg', { width: 1000, height: 2000, target: PHONE, sha256: 'aa' }],
    ['c.jpg', { width: 1000, height: 2000, target: PHONE, sha256: 'aa' }],
  ]);
  const problems = checkLayoutReport(
    {
      'a.jpg': entry(),
      'c.jpg': entry({
        canvas: { width: 900, height: 2000 },
        caption: { x: 100, y: 200, width: 700, height: 400 },
      }),
      'gone.jpg': entry(),
    },
    shots
  );
  assert.deepEqual(problems, [
    `b.jpg: missing from ${LAYOUT_REPORT_FILE}`,
    `c.jpg: ${LAYOUT_REPORT_FILE} says 900x2000, image is 1000x2000`,
    `gone.jpg: in ${LAYOUT_REPORT_FILE} but not a screenshot`,
  ]);
});

test('flags a report that was measured on a different image', () => {
  const shots = new Map([
    ['a.jpg', { width: 1000, height: 2000, target: PHONE, sha256: 'bb' }],
  ]);
  const problems = checkLayoutReport({ 'a.jpg': entry() }, shots);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /a\.jpg: .*sha256 differs/);
  assert.deepEqual(
    checkLayoutReport(
      { 'a.jpg': entry({ sha256: 'bb' }) },
      new Map([['a.jpg', { ...shots.get('a.jpg') }]])
    ),
    []
  );
});

test('records the card, chip and hash of a measured image', () => {
  const target = { width: 1000, height: 2000, layout: 'stack' };
  const measured = {
    caption: { x: 100, y: 200, width: 800, height: 400 },
    card: { x: 60.04, y: 700, width: 880, height: 1400 },
    chip: { x: 500, y: 900, width: 300, height: 80, fontSize: 30.06 },
    headline: { fontSize: 120, lines: 2 },
  };
  const entryWithChip = reportEntry(target, measured, 'abc');
  assert.equal(entryWithChip.sha256, 'abc');
  assert.deepEqual(entryWithChip.card, {
    x: 60,
    y: 700,
    width: 880,
    height: 1400,
  });
  assert.equal(entryWithChip.chip.fontSize, 30.1);
  assert.equal(
    'chip' in reportEntry(target, { ...measured, chip: null }, 'a'),
    false
  );
});

test('keeps the caption clear of the card', () => {
  assert.deepEqual(checkCardLayout('a.jpg', entry(), PHONE), []);
  const overlapping = entry({
    card: { x: 60, y: 500, width: 880, height: 1400 },
  });
  assert.match(
    checkCardLayout('a.jpg', overlapping, PHONE)[0],
    /caption overlaps the card/
  );
  assert.match(
    checkCardLayout('a.jpg', { ...entry(), card: undefined }, PHONE)[0],
    /no card box/
  );
});

test('keeps the chip inside the card at a readable size', () => {
  const chip = { x: 500, y: 900, width: 300, height: 80, fontSize: 30 };
  assert.deepEqual(checkCardLayout('a.jpg', entry({ chip }), PHONE), []);
  const above = { ...chip, y: 690 };
  assert.match(
    checkCardLayout('a.jpg', entry({ chip: above }), PHONE)[0],
    /chip leaves the card/
  );
  const right = { ...chip, x: 700 };
  assert.match(
    checkCardLayout('a.jpg', entry({ chip: right }), PHONE)[0],
    /chip leaves the card/
  );
  const small = { ...chip, fontSize: 25 };
  assert.match(
    checkCardLayout('a.jpg', entry({ chip: small }), PHONE)[0],
    /chip text is 25 px, needs at least 26 px/
  );
  assert.deepEqual(
    checkCardLayout('a.jpg', entry({ chip: small }), TABLET),
    []
  );
});

test('merges measured entries into layout-report.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-report-'));
  try {
    const shots = path.join(root, 'apps/mobile/store/screenshots/ios/x/en');
    fs.mkdirSync(shots, { recursive: true });
    fs.writeFileSync(path.join(shots, '01-a.jpg'), '');
    fs.writeFileSync(path.join(shots, '02-b.jpg'), '');
    const measured = {
      caption: { x: 100.04, y: 200, width: 800, height: 400 },
      card: { x: 60, y: 700, width: 880, height: 1400 },
      headline: { fontSize: 120.3, lines: 2 },
    };
    const target = { width: 1000, height: 2000, layout: 'stack' };
    writeLayoutReport(root, {
      'ios/x/en/01-a.jpg': reportEntry(target, measured),
      'ios/x/en/02-b.jpg': reportEntry(target, measured),
    });
    fs.rmSync(path.join(shots, '02-b.jpg'));
    writeLayoutReport(root, {
      'ios/x/en/01-a.jpg': reportEntry(target, {
        ...measured,
        headline: { fontSize: 100, lines: 1 },
      }),
    });
    const report = readLayoutReport(root);
    assert.deepEqual(Object.keys(report), ['ios/x/en/01-a.jpg']);
    assert.deepEqual(report['ios/x/en/01-a.jpg'].caption, {
      x: 100,
      y: 200,
      width: 800,
      height: 400,
    });
    assert.deepEqual(report['ios/x/en/01-a.jpg'].headline, {
      fontSize: 100,
      lines: 1,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('every target has a layout slot and its caption starts in the safe area', () => {
  const expected = {
    'ios/iphone-6.9': 'stack',
    'ios/iphone-6.3': 'stack',
    'ios/iphone-6.5': 'stack',
    'ios/iphone-duo-outer': 'stack',
    'ios/iphone-duo-inner': 'side',
    'ios/ipad-13': 'tablet',
    'android/phone': 'stack',
    'android/tablet7': 'stack',
    'android/tablet10': 'tablet',
    'macos/mac': 'window',
    'windows/desktop': 'window',
  };
  for (const target of SCREENSHOT_TARGETS) {
    const id = `${target.store}/${target.device}`;
    assert.equal(target.layout, expected[id], id);
    assert.ok(LAYOUTS.includes(target.layout));
    const spec = screenshotSpec(target);
    const { caption } = spec;
    assert.ok(caption.x >= target.width * 0.05, `${id} left inset`);
    assert.ok(
      caption.x + caption.w <= target.width * 0.95,
      `${id} right inset`
    );
    if (caption.y != null) {
      assert.ok(caption.y >= target.height * 0.05, `${id} top inset`);
    } else {
      assert.ok(caption.centerAt > 0.2 && caption.centerAt < 0.8, id);
    }
    assert.ok(caption.headline >= spec.minHeadline, `${id} headline size`);
    assert.equal(spec.width, target.width);
    assert.equal(spec.height, target.height);
  }
  assert.deepEqual(
    Object.values(expected)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort(),
    [...LAYOUTS].sort()
  );
});

test('draws no status bar', () => {
  for (const target of SCREENSHOT_TARGETS) {
    const { html } = screenshotHtml({
      target,
      headline: 'Headline',
      overline: 'Label',
      rawUrl: 'data:image/png;base64,AAAA',
    });
    assert.doesNotMatch(html, /9:41|status|clock|<svg/);
  }
});

test('fans three cards on the stack frames and two on the tablet frames', () => {
  const urls = {
    stack: { left: 'data:l', right: 'data:r' },
    tablet: { right: 'data:r' },
  };
  const expected = { stack: 3, tablet: 2 };
  for (const target of SCREENSHOT_TARGETS) {
    const { html, spec } = screenshotHtml({
      target,
      headline: 'H',
      overline: 'O',
      rawUrl: 'data:c',
      fanUrls: urls[target.layout] ?? urls.stack,
    });
    const cards = html.match(/class="card/g).length;
    const fanned = target.layout in expected;
    assert.equal(cards, fanned ? expected[target.layout] : 1, target.device);
    assert.equal(Boolean(spec.fan), fanned);
  }
});

test('a cropped tablet card is wider and carries its crop', () => {
  const target = SCREENSHOT_TARGETS.find((t) => t.layout === 'tablet');
  const full = screenshotSpec(target, {});
  const cropped = screenshotSpec(target, { crop: true });
  assert.ok(cropped.card.w > full.card.w);
  assert.equal(
    Math.round((cropped.card.x * 2 + cropped.card.w) * 10),
    Math.round(target.width * 10)
  );
  const { html } = screenshotHtml({
    target,
    headline: 'H',
    overline: 'O',
    rawUrl: 'data:c',
    crop: 0.62,
  });
  assert.match(html, /&quot;crop&quot;:0\.62/);
});

test('a layout without a cropped box ignores the crop', () => {
  for (const target of SCREENSHOT_TARGETS.filter(
    (t) => t.layout !== 'tablet'
  )) {
    assert.deepEqual(
      screenshotSpec(target, { crop: true }).card,
      screenshotSpec(target, {}).card,
      target.device
    );
  }
});
