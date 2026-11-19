import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { inventory, prepare, verify } from './wave1-native-artifact.mjs';
import { assertRouteFree } from './wave1-native-production.mjs';
import {
  assertNoServerSourceMaps,
  assertWorkerModuleRoot,
  stripServerSourceMaps,
} from './wave1-native-source-maps.mjs';
import {
  assertSourceMapUpload,
  uploadLimits,
} from './wave1-native-upload-limits.mjs';
import { fixture } from './wave1-native-test-fixture.cjs';

const sha = 'a'.repeat(40);
const module =
  'export default { fetch() { return new Response("fixture"); } };';

// A server map set over the 60 MiB encoded limit, as emitted by the Calendar build.
function oversizedMaps(app) {
  const server = join(app, 'dist/server');
  writeFileSync(
    join(server, 'index.js'),
    `${module}\n//# sourceMappingURL=index.js.map\n`
  );
  mkdirSync(join(server, 'assets'));
  writeFileSync(
    join(server, 'assets/chunk.mjs'),
    'export const chunk = 1;\n//# sourceMappingURL=chunk.mjs.map'
  );
  const mappings = 'A'.repeat(uploadLimits.sourcemapEncodedBytes + 1024);
  writeFileSync(
    join(server, 'index.js.map'),
    JSON.stringify({ version: 3, sources: ['index.ts'], mappings })
  );
  writeFileSync(
    join(server, 'assets/chunk.mjs.map'),
    JSON.stringify({ version: 3, sources: ['chunk.ts'], mappings: 'AAAA' })
  );
  writeFileSync(join(app, 'dist/client/assets/app.js.map'), '{}');
}

// Measures what Wrangler would send if the sealed config enabled map uploads.
function mapsIfEnabled(config) {
  const probe = join(dirname(config), 'maps-enabled.json');
  writeFileSync(
    probe,
    JSON.stringify({
      ...JSON.parse(readFileSync(config, 'utf8')),
      upload_source_maps: true,
    })
  );
  try {
    return assertSourceMapUpload(probe);
  } finally {
    rmSync(probe);
  }
}

test('Calendar production seal uploads no server source maps', (t) => {
  const app = fixture(t, 'calendar');
  oversizedMaps(app);
  const receipt = prepare(app, 'calendar', 'production', undefined, sha);
  const sealed = Object.keys(receipt.files);
  assert.deepEqual(
    sealed.filter(
      (name) => name.startsWith('server/') && name.endsWith('.map')
    ),
    [],
    'the seal covers only uploaded Worker files'
  );
  assert.equal(
    readFileSync(join(app, 'dist/server/index.js'), 'utf8'),
    `${module}\n\n`
  );
  assert.equal(
    readFileSync(join(app, 'dist/server/assets/chunk.mjs'), 'utf8'),
    'export const chunk = 1;\n'
  );
  // Public assets are uploaded as they are; the Worker module root is not.
  assert.ok(sealed.includes('client/assets/app.js.map'));
  const restored = verify(app, 'calendar', 'production', sha);
  assertRouteFree(JSON.parse(readFileSync(restored.config, 'utf8')));
  assert.deepEqual(mapsIfEnabled(restored.config), {
    count: 0,
    encodedBytes: 0,
    gzipBytes: 0,
  });
});

test('an unstripped production map set exceeds the provider limit', (t) => {
  const app = fixture(t, 'calendar');
  oversizedMaps(app);
  const receipt = prepare(app, 'calendar', 'staging', undefined, sha);
  assert.ok(receipt.files['server/index.js.map'], 'staging keeps its maps');
  assert.throws(
    () => mapsIfEnabled(join(app, 'dist/wave1/wrangler.json')),
    /Source map encoded bytes \d+ > 62914560/u
  );
});

test('production verify refuses a seal that still carries server maps', (t) => {
  const app = fixture(t, 'calendar');
  prepare(app, 'calendar', 'production', undefined, sha);
  writeFileSync(join(app, 'dist/server/index.js.map'), '{}');
  const path = join(app, 'wave1-artifact.json');
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  receipt.files = inventory(join(app, 'dist'));
  writeFileSync(path, JSON.stringify(receipt));
  assert.throws(
    () => verify(app, 'calendar', 'production', sha),
    /Server source map in sealed Worker: index\.js\.map/u
  );
});

test('every wave-1 production seal strips server maps', (t) => {
  for (const name of ['mail', 'apps', 'finance', 'calendar']) {
    const app = fixture(t, name);
    writeFileSync(join(app, 'dist/server/index.js.map'), '{}');
    prepare(app, name, 'production', undefined, sha);
    assert.equal(existsSync(join(app, 'dist/server/index.js.map')), false);
    verify(app, name, 'production', sha);
  }
});

test('stripping keeps inline maps and fails closed on unsafe roots', (t) => {
  const app = fixture(t, 'calendar');
  const server = join(app, 'dist/server');
  const inline = `${module}\n//# sourceMappingURL=data:application/json;base64,e30=\n`;
  writeFileSync(join(server, 'index.js'), inline);
  assert.deepEqual(stripServerSourceMaps(server), {
    count: 0,
    bytes: 0,
    references: 0,
  });
  assert.equal(readFileSync(join(server, 'index.js'), 'utf8'), inline);
  writeFileSync(join(server, 'late.mjs'), 'x;\n//@ sourceMappingURL=late.map');
  assert.throws(
    () => assertNoServerSourceMaps(server),
    /Server source map reference in sealed Worker: late\.mjs/u
  );
  rmSync(join(server, 'late.mjs'));
  symlinkSync(join(app, 'dist/client/assets/app.js'), join(server, 'link.js'));
  assert.throws(() => stripServerSourceMaps(server), /symlink forbidden/u);
  const dist = join(app, 'dist');
  assert.throws(
    () => assertWorkerModuleRoot(dist, dist, join(dist, 'client')),
    /inside dist/u
  );
  assert.throws(
    () => assertWorkerModuleRoot(dist, server, join(server, 'client')),
    /must not contain the asset directory/u
  );
});
