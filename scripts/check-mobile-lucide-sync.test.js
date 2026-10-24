const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');

const { main, validate } = require('./check-mobile-lucide-sync.js');

const lock = (react, lab) =>
  [
    `    "@lucide/lab": ["@lucide/lab@${lab}", "", {}, "sha512-LAB${lab}"],`,
    `    "lucide-react": ["lucide-react@${react}", "", { "peerDependencies": { "react": "*" } }, "sha512-REACT${react}"],`,
  ].join('\n');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const manifest = (react, lab, files = {}) => ({
  sets: {
    base: { version: react, integrity: `sha512-REACT${react}`, icons: 1 },
    lab: { version: lab, integrity: `sha512-LAB${lab}`, icons: 1 },
  },
  files,
});

test('passes when versions and generated files match', () => {
  const files = { 'a.dart': 'x' };
  assert.deepEqual(
    validate({
      lockText: lock('1.61.0', '0.7.0'),
      manifest: manifest('1.61.0', '0.7.0', { 'a.dart': sha('x') }),
      readFile: (file) => files[file] ?? null,
    }),
    []
  );
});

test('fails when the web version moves without regeneration', () => {
  const errors = validate({
    lockText: lock('1.62.0', '0.8.0'),
    manifest: manifest('1.61.0', '0.7.0'),
    readFile: () => null,
  });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /lucide-react@1\.62\.0 .* generated from 1\.61\.0/u);
  assert.match(errors[1], /@lucide\/lab@0\.8\.0/u);
});

test('fails on hand-edited or missing generated files', () => {
  const errors = validate({
    lockText: lock('1.61.0', '0.7.0'),
    manifest: manifest('1.61.0', '0.7.0', {
      'a.dart': sha('x'),
      'b.otf': sha('y'),
    }),
    readFile: (file) => (file === 'a.dart' ? 'edited' : null),
  });
  assert.deepEqual(errors, [
    'Generated file a.dart differs from the manifest.',
    'Generated file b.otf is missing.',
  ]);
});

test('the checked-in icons match the repository bun.lock', () => {
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(main(), 0);
  } finally {
    console.log = log;
  }
});
