const assert = require('node:assert/strict');
const test = require('node:test');

const {
  dartName,
  emitDart,
  normaliseNode,
  orientForNonzero,
  parseContours,
  parseIconModule,
  planGlyphs,
} = require('./sources.js');

test('web names become lowerCamelCase Dart identifiers', () => {
  assert.equal(dartName('arrow-down-0-1'), 'arrowDown01');
  assert.equal(dartName('a-arrow-down'), 'aArrowDown');
  assert.equal(dartName('switch'), 'switchIcon');
  assert.equal(dartName('import'), 'import');
});

test('parses canonical and alias icon modules', () => {
  const canonical = parseIconModule(`const __iconData = {
  name: "house",
  size: 24,
  node: [
    ["path", { d: "M3 10v9", key: "a" }],
    [
      "circle",
      {
        cx: "12",
        cy: "12",
        r: "1",
        fill: "currentColor",
        key: "b"
      }
    ]
  ],
  aliases: ["home"]
};`);
  assert.equal(canonical.name, 'house');
  assert.deepEqual(canonical.aliases, ['home']);
  assert.deepEqual(normaliseNode(canonical.node, 'house'), [
    { kind: 'path', filled: false, d: 'M3 10v9' },
    { kind: 'circle', filled: true, cx: 12, cy: 12, r: 1 },
  ]);
  assert.deepEqual(parseIconModule("export { default } from './house.mjs';"), {
    aliasOf: 'house',
  });
  assert.equal(parseIconModule("export * from './icons/index.mjs';"), null);
});

test('unknown elements or attributes fail instead of being dropped', () => {
  assert.throws(
    () => normaliseNode([['text', {}]], 'x'),
    /unsupported <text>/u
  );
  assert.throws(
    () => normaliseNode([['path', { d: 'M0 0', transform: 'x' }]], 'x'),
    /unsupported path\.transform/u
  );
  assert.throws(
    () => normaliseNode([['circle', { cx: 1, cy: 1, r: 1, fill: 'red' }]], 'x'),
    /unsupported fill/u
  );
});

test('glyph plans are sorted, stable and keep web aliases', () => {
  const plan = planGlyphs([
    { name: 'x', aliases: [] },
    { name: 'house', aliases: ['home'] },
    { name: 'arrow-down-0-1', aliases: ['arrow-down-01'] },
  ]);
  assert.deepEqual(
    plan.glyphs.map((g) => [g.name, g.codepoint]),
    [
      ['arrow-down-0-1', 0xe000],
      ['house', 0xe001],
      ['x', 0xe002],
    ]
  );
  assert.deepEqual(plan.aliases, [
    { alias: 'home', dartName: 'home', target: 'house' },
  ]);
  assert.equal(plan.skippedAliases[0].alias, 'arrow-down-01');
  const dart = emitDart({
    kind: 'base',
    version: '1.0.0',
    licenseFile: 'L',
    ...plan,
  });
  assert.match(dart, /GENERATED CODE - DO NOT MODIFY BY HAND/u);
  assert.match(dart, /static const IconData home = house;/u);
});

test('even-odd holes become opposite-direction contours for nonzero fill', () => {
  // Outer square and an inner square drawn in the same direction: under
  // nonzero both fill; after orientation the inner one must be reversed.
  const svg = 'M0 0L10 0L10 10L0 10Z M2 2L8 2L8 8L2 8Z M4 4L6 4L6 6L4 6Z';
  const oriented = orientForNonzero(svg);
  const [outer, hole, island] = parseContours(oriented);
  const area = (contour) => {
    const pts = [
      contour.start,
      ...contour.segments.map((s) => s.points.at(-1)),
    ];
    return pts.reduce((sum, [x, y], k) => {
      const [nx, ny] = pts[(k + 1) % pts.length];
      return sum + x * ny - nx * y;
    }, 0);
  };
  assert.ok(area(outer) > 0);
  assert.ok(area(hole) < 0);
  assert.ok(area(island) > 0);
  // Curves keep their control points when reversed.
  const curve = orientForNonzero('M0 0L10 0L10 10L0 10Z M2 2Q5 1 8 2L8 8L2 8Z');
  assert.match(curve, /Q5 1 2 2/u);
});

test('a hole just inside a bulging curve is nested by the true curve', () => {
  // Review repro: the hole sits between the quadratic and its coarse
  // eight-segment approximation, so it must still be reversed.
  const oriented = orientForNonzero(
    'M0 0Q10 -20 20 0L20 20L0 20Z M0.99 -1.85L1.01 -1.85L1.01 -1.82L0.99 -1.82Z'
  );
  const [outer, hole] = parseContours(oriented);
  const area = (contour) => {
    const pts = [
      contour.start,
      ...contour.segments.map((s) => s.points.at(-1)),
    ];
    return pts.reduce((sum, [x, y], k) => {
      const [nx, ny] = pts[(k + 1) % pts.length];
      return sum + x * ny - nx * y;
    }, 0);
  };
  assert.ok(Math.sign(area(outer)) !== Math.sign(area(hole)), oriented);
});
