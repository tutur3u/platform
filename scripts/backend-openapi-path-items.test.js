const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readOpenApiSource } = require('./backend-openapi-path-items');

function fixture(reference, moduleSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-path-items-'));
  fs.mkdirSync(path.join(root, 'paths'));
  const main = path.join(root, 'openapi.yaml');
  fs.writeFileSync(
    main,
    `paths:\n  /api/profile:\n    $ref: "${reference}"\ncomponents:\n  schemas:\n    Profile:\n      type: object\n`
  );
  fs.writeFileSync(path.join(root, 'paths', 'profile.yaml'), moduleSource);
  return { root, main };
}

test('local path items preserve methods and root component response refs', () => {
  const { root, main } = fixture(
    './paths/profile.yaml#/Profile',
    `Profile:
  get:
    responses:
      "200":
        description: Read profile.
  head:
    responses:
      "200":
        description: No body.
  patch:
    responses:
      "411":
        $ref: "../openapi.yaml#/components/responses/RequestBodyLengthRequired"
`
  );
  try {
    const source = readOpenApiSource(main);
    assert.match(source, /^ {2}\/api\/profile:\n {4}get:/m);
    assert.match(source, /^ {4}head:/m);
    assert.match(source, /^ {4}patch:/m);
    assert.match(
      source,
      /"411":\n {10}\$ref: "#\/components\/responses\/RequestBodyLengthRequired"/
    );
    assert.match(source, /^components:/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('path-item resolution rejects remote, escaping and missing references', () => {
  for (const reference of [
    'https://example.invalid/profile.yaml#/Profile',
    '../profile.yaml#/Profile',
    './paths/profile.yaml#/Missing',
  ]) {
    const { root, main } = fixture(reference, 'Profile:\n  get:\n');
    try {
      assert.throws(() => readOpenApiSource(main));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('missing methods stay missing and ambiguous path-item definitions fail', () => {
  for (const moduleSource of [
    'Profile:\n  get:\n',
    'Profile:\n  get:\nProfile:\n  head:\n',
    'Profile:\n  $ref: "./other.yaml#/Profile"\n',
  ]) {
    const { root, main } = fixture(
      './paths/profile.yaml#/Profile',
      moduleSource
    );
    try {
      if (moduleSource === 'Profile:\n  get:\n') {
        assert.doesNotMatch(readOpenApiSource(main), /^ {4}head:/m);
      } else {
        assert.throws(() => readOpenApiSource(main));
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
