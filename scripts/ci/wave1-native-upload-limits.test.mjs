import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { uploadArtifact } from './wave1-native-publish.mjs';
import {
  assertUploadLimits,
  measureUpload,
  uploadLimits,
} from './wave1-native-upload-limits.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-size-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['out', 'assets']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'out/index.mjs'), 'export default {};');
  writeFileSync(join(root, 'out/README.md'), 'CLI metadata is not a module');
  writeFileSync(join(root, 'assets/hello.txt'), 'hello');
  writeFileSync(
    join(root, 'config.json'),
    JSON.stringify({
      upload_source_maps: false,
      assets: { directory: './assets' },
      secrets: { required: ['EXISTING_SECRET'] },
      vars: { APP_URL: 'https://example.test' },
    })
  );
  return {
    root,
    measure: (cliSize) =>
      measureUpload(join(root, 'config.json'), join(root, 'out'), [], cliSize),
  };
}
test('actual output measurement excludes CLI metadata and preserves exact module bytes', (t) => {
  const p = fixture(t),
    m = p.measure();
  assert.equal(m.script.bytes, Buffer.byteLength('export default {};'));
  assert.equal(m.script.gzipBytes, gzipSync('export default {};').length);
  assert.equal(m.script.moduleCount, 1);
  assert.equal(m.assets.count, 1);
  assert.equal(m.assets.maxFileBytes, 5);
  assert.equal(m.sourcemaps.encodedBytes, 0);
  assert.equal(m.variables.count, 2);
  assert.equal(assertUploadLimits(m), m);
});
for (const [name, field, limit] of [
  ['uncompressed script', 'script.bytes', 64 * 1024 ** 2],
  ['encoded sourcemaps', 'sourcemaps.encodedBytes', 60 * 1024 ** 2],
  ['gzip sourcemaps', 'sourcemaps.gzipBytes', 15 * 1024 ** 2],
  ['static asset count', 'assets.count', 100000],
  ['static asset size', 'assets.maxFileBytes', 25 * 1024 ** 2],
  ['variable count', 'variables.count', 128],
  ['variable bytes', 'variables.maxPlainValueBytes', 5000],
])
  test(`${name} accepts the documented boundary and refuses one byte or item beyond`, (t) => {
    const p = fixture(t),
      m = p.measure();
    m.sourcemaps.enabled = true;
    const [group, key] = field.split('.');
    const set = (value) => {
      m[group][key] = value;
      if (field === 'script.bytes') {
        m.script.modules[0].bytes = value;
        m.script.maxModuleBytes = value;
      }
    };
    set(limit);
    assertUploadLimits(m);
    set(limit + 1);
    assert.throws(
      () => assertUploadLimits(m),
      /Documented upload limits exceeded/u
    );
  });
test('Worker gzip over ten MiB is informational and never a release limit', (t) => {
  const m = fixture(t).measure({ raw_bytes: 18, gzip_bytes: 11 * 1024 ** 2 });
  assert.equal(m.warnings.length, 1);
  assert.doesNotThrow(() => assertUploadLimits(m));
});

test('main-module maps use their sealed original path and canonical encoding', (t) => {
  const p = fixture(t);
  mkdirSync(join(p.root, 'source'));
  writeFileSync(
    join(p.root, 'out/index.mjs'),
    'export default {};\n//# sourceMappingURL=index.mjs.map'
  );
  const map = {
    version: 3,
    file: 'old-name',
    sources: ['../src.ts'],
    mappings: '',
  };
  writeFileSync(
    join(p.root, 'source/index.mjs.map'),
    JSON.stringify(map, null, 2)
  );
  writeFileSync(
    join(p.root, 'config.json'),
    JSON.stringify({
      main: './source/index.mjs',
      upload_source_maps: true,
      assets: { directory: './assets' },
      vars: {},
    })
  );
  const m = p.measure();
  const bytes = Buffer.from(
    JSON.stringify({ ...map, file: 'index.mjs', sources: ['src.ts'] })
  );
  assert.equal(m.sourcemaps.count, 1);
  assert.equal(m.sourcemaps.encodedBytes, bytes.length);
  assert.equal(m.sourcemaps.gzipBytes, gzipSync(bytes).length);
  assertUploadLimits(m);
});
test('maps emitted despite disabled uploads fail closed', (t) => {
  const p = fixture(t);
  writeFileSync(join(p.root, 'out/index.mjs.map'), '{}');
  assert.throws(() => assertUploadLimits(p.measure()), /Source maps emitted/u);
});
test('missing source map compression measurements cannot bypass the guard', (t) => {
  const m = fixture(t).measure();
  m.sourcemaps.gzipBytes = null;
  assert.throws(() => assertUploadLimits(m), /Missing compressed/u);
});
test('the documented limit inventory has no compressed Worker ceiling', () => {
  assert.equal(uploadLimits.scriptBytes, 67108864);
  assert.equal(Object.hasOwn(uploadLimits, 'scriptGzipBytes'), false);
  assert.equal(uploadLimits.startupCpuMs, 1000);
});
test('the upload boundary refuses an oversized candidate before invoking the CLI', async (t) => {
  const p = fixture(t),
    measurements = p.measure();
  measurements.script.bytes = 67108865;
  measurements.script.modules[0].bytes = 67108865;
  measurements.script.maxModuleBytes = 67108865;
  let calls = 0;
  await assert.rejects(
    uploadArtifact({
      env: { RUNNER_TEMP: p.root },
      app: 'calendar',
      environment: 'production',
      config: join(p.root, 'config.json'),
      sha: 'a'.repeat(40),
      digest: 'b'.repeat(64),
      cfToken: 'fixture-only',
      p: { name: 'tuturuuu-calendar', accountId: 'c'.repeat(32) },
      measurements,
      exec: () => {
        calls++;
      },
    }),
    /Documented upload limits exceeded/u
  );
  assert.equal(calls, 0);
});
test('a measurement invocation cannot receive a deploy credential', async (t) => {
  const p = fixture(t);
  let calls = 0;
  await assert.rejects(
    uploadArtifact({
      env: { RUNNER_TEMP: p.root },
      app: 'calendar',
      environment: 'staging',
      config: join(p.root, 'config.json'),
      sha: 'a'.repeat(40),
      digest: 'b'.repeat(64),
      cfToken: 'fixture-only',
      p: { name: 'tuturuuu-calendar-wave1-staging' },
      dryRun: true,
      exec: () => {
        calls++;
      },
    }),
    /Deploy credential forbidden/u
  );
  assert.equal(calls, 0);
});
