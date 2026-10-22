import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readNativeRuntimeConfig } from './apps-native-runtime-pointer.mjs';

const native = '.wrangler/deploy/config.json';
const saved = '.void/preview-deploy-config.json';
const payload = JSON.stringify({
  configPath: '../../dist/native/wrangler.json',
  auxiliaryWorkers: [],
});
function fixture(t, pointer = saved, value = payload) {
  const app = realpathSync(mkdtempSync(join(tmpdir(), 'apps-pointer-')));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  mkdirSync(join(app, 'dist/native'), { recursive: true });
  writeFileSync(
    join(app, 'dist/native/wrangler.json'),
    '{"name":"sealed-fixture"}'
  );
  put(app, pointer, value);
  return app;
}
function put(app, pointer, value) {
  mkdirSync(join(app, pointer, '..'), { recursive: true });
  writeFileSync(join(app, pointer), value);
}
for (const pointer of [native, saved]) {
  test(`${pointer} retains native relative base and pointer bytes`, (t) => {
    const app = fixture(t, pointer);
    assert.deepEqual(readNativeRuntimeConfig(app), {
      configPath: join(app, 'dist/native/wrangler.json'),
      config: { name: 'sealed-fixture' },
    });
    assert.equal(readFileSync(join(app, pointer), 'utf8'), payload);
  });
}
test('both and neither pointers fail closed', (t) => {
  const app = fixture(t);
  put(app, native, payload);
  assert.throws(() => readNativeRuntimeConfig(app), /Exactly one/);
  rmSync(join(app, native));
  rmSync(join(app, saved));
  assert.throws(() => readNativeRuntimeConfig(app), /Exactly one/);
});
for (const value of [
  '{',
  'null',
  '[]',
  '{}',
  JSON.stringify({
    configPath: '../../dist/native/wrangler.json',
    auxiliaryWorkers: {},
  }),
  JSON.stringify({
    configPath: '../../dist/native/wrangler.json',
    auxiliaryWorkers: [],
    extra: true,
  }),
  ...[
    '',
    1,
    '/tmp/outside.json',
    '../../../outside.json',
    '../dist/native/wrangler.json',
    '../../dist\\native/wrangler.json',
    '../../dist/native/wrangler.json\n',
  ].map((configPath) => JSON.stringify({ configPath, auxiliaryWorkers: [] })),
]) {
  test(`reject malformed, escape or wrong-base pointer ${value}`, (t) => {
    const app = fixture(t, saved, value);
    assert.throws(() => readNativeRuntimeConfig(app));
  });
}
for (const target of [saved, '.void', 'dist', 'dist/native/wrangler.json']) {
  test(`reject symlink ${target}`, (t) => {
    const app = fixture(t);
    const path = join(app, target);
    const moved = join(app, 'original');
    if (target === saved) {
      rmSync(path);
      symlinkSync('missing', path);
    } else {
      // A link to even identical local output must not pass artifact acceptance.
      if (target === 'dist/native/wrangler.json') writeFileSync(moved, '{}');
      else mkdirSync(moved);
      rmSync(path, { recursive: true });
      symlinkSync(moved, path);
    }
    assert.throws(() => readNativeRuntimeConfig(app));
  });
}
