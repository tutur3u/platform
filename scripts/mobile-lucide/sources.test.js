const assert = require('node:assert/strict');
const test = require('node:test');

const {
  dartName,
  emitDart,
  normaliseNode,
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
