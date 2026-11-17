const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { sortObjectKeysDeep } = require('./i18n-common');

test('sorting translation objects preserves nested arrays and their order', () => {
  const messages = {
    z: [{ title: 'First', steps: ['second', 'first'] }, ['nested']],
    a: 'Label',
  };
  assert.deepEqual(sortObjectKeysDeep(messages), messages);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sortObjectKeysDeep(messages))),
    messages
  );
});

test('application messages preserve indexed translation array contracts', () => {
  const contracts = {
    ...require('./i18n-array-paths.en.json'),
    ...require('./i18n-array-paths.vi.json'),
  };
  for (const [file, paths] of Object.entries(contracts)) {
    const messages = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
    );
    for (const keyPath of paths) {
      const segments = keyPath.split('.');
      const value = segments.reduce((parent, key) => parent?.[key], messages);
      assert.ok(
        Array.isArray(value),
        `${file}:${segments.join('.')}: expected an array`
      );
    }
  }
});
