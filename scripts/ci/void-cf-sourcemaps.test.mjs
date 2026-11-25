import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { measureBuildOutputUpload } from './cf-build-output-publisher.mjs';
import { emitVoidCfOutput, serverModuleSelection } from './void-cf-output.mjs';
import {
  selectSourceMaps,
  sourceMapBudget,
  SOURCEMAP_SAFETY_RATIO,
} from './void-cf-sourcemaps.mjs';
import { uploadLimits } from './wave1-native-upload-limits.mjs';

// A budget of 1000 encoded and 10 000 gzipped bytes, so gzip never binds
// unless a test says so.
const small = sourceMapBudget({
  sourcemapEncodedBytes: 1000,
  sourcemapGzipBytes: 10_000,
});
const map = (name, bytes, gzipBytes = Math.ceil(bytes / 4)) => ({
  name,
  bytes,
  gzipBytes,
});

test('the budget keeps a 10% margin under the repository upload limits', () => {
  const budget = sourceMapBudget();
  assert.equal(budget.encodedLimitBytes, uploadLimits.sourcemapEncodedBytes);
  assert.equal(budget.encodedLimitBytes, 62_914_560);
  assert.equal(SOURCEMAP_SAFETY_RATIO, 0.9);
  assert.equal(budget.encodedBudgetBytes, Math.floor(62_914_560 * 0.9));
  assert.equal(
    budget.gzipBudgetBytes,
    Math.floor(uploadLimits.sourcemapGzipBytes * 0.9)
  );
});

test('maps under the limit all ship', () => {
  const maps = [map('index.js.map', 400), map('a.js.map', 300)];
  const selection = selectSourceMaps(maps, 'index.js.map', small);
  assert.deepEqual(selection.kept, ['a.js.map', 'index.js.map']);
  assert.equal(selection.droppedCount, 0);
  assert.deepEqual(selection.dropped, []);
});

test('maps over the limit keep the main map, then the smallest, within 90%', () => {
  const maps = [
    map('index.js.map', 500),
    map('big.js.map', 450),
    map('a.js.map', 150),
    map('b.js.map', 200),
    map('c.js.map', 250),
  ];
  const selection = selectSourceMaps(maps, 'index.js.map', small);
  // 1550 > 1000: keep index (500), a (150), b (200) = 850 <= 900; c and big
  // would exceed the 900-byte budget.
  assert.deepEqual(selection.kept, ['a.js.map', 'b.js.map', 'index.js.map']);
  assert.equal(selection.keptBytes, 850);
  assert.ok(selection.keptBytes <= small.encodedBudgetBytes);
  assert.deepEqual(selection.dropped, [
    { name: 'big.js.map', bytes: 450 },
    { name: 'c.js.map', bytes: 250 },
  ]);
  assert.equal(selection.droppedCount, 2);
  assert.equal(selection.droppedBytes, 700);
  assert.equal(selection.totalBytes, 1550);
});

test('maps that cannot fit even one are all dropped', () => {
  const maps = [map('index.js.map', 950), map('a.js.map', 1200)];
  const selection = selectSourceMaps(maps, 'index.js.map', small);
  assert.deepEqual(selection.kept, []);
  assert.equal(selection.keptBytes, 0);
  assert.deepEqual(
    selection.dropped.map(({ name }) => name),
    ['a.js.map', 'index.js.map']
  );
});

test('a main map too large to fit gives way to smaller maps', () => {
  const maps = [map('index.js.map', 950), map('a.js.map', 100)];
  const selection = selectSourceMaps(maps, 'index.js.map', small);
  assert.deepEqual(selection.kept, ['a.js.map']);
  assert.deepEqual(selection.dropped, [{ name: 'index.js.map', bytes: 950 }]);
});

test('the gzip limit alone can force drops', () => {
  const budget = sourceMapBudget({
    sourcemapEncodedBytes: 1_000_000,
    sourcemapGzipBytes: 100,
  });
  const maps = [map('index.js.map', 50, 60), map('a.js.map', 60, 60)];
  const selection = selectSourceMaps(maps, 'index.js.map', budget);
  assert.deepEqual(selection.kept, ['index.js.map']);
  assert.ok(selection.keptGzipBytes <= budget.gzipBudgetBytes);
});

// A server directory with three ESM modules and incompressible maps of known
// sizes, plus a map without a module that is never a candidate.
function server() {
  const root = mkdtempSync(join(tmpdir(), 'void-cf-maps-'));
  const dir = join(root, 'dist/server');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.js'),
    'import "./assets/a.js";\nexport default {};\n'
  );
  writeFileSync(join(dir, 'assets/a.js'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'assets/b.js'), 'export const b = 2;\n');
  writeFileSync(join(dir, 'assets/data.bin'), Buffer.from([1, 2]));
  writeFileSync(join(dir, 'index.js.map'), randomBytes(400));
  writeFileSync(join(dir, 'assets/a.js.map'), randomBytes(300));
  writeFileSync(join(dir, 'assets/b.js.map'), randomBytes(500));
  writeFileSync(join(dir, 'orphan.js.map'), randomBytes(10));
  return { root, dir };
}

const nonMaps = (modules) =>
  Object.fromEntries(
    Object.entries(modules).filter(([, { type }]) => type !== 'sourcemap')
  );

test('dropping maps never changes the JS modules or the rest of the manifest', () => {
  const { root, dir } = server();
  try {
    const roomy = sourceMapBudget({
      sourcemapEncodedBytes: 1_000_000,
      sourcemapGzipBytes: 1_000_000,
    });
    const tight = sourceMapBudget({
      sourcemapEncodedBytes: 1000,
      sourcemapGzipBytes: 1_000_000,
    });
    const all = serverModuleSelection(dir, 'index.js', true, roomy);
    const dropped = serverModuleSelection(dir, 'index.js', true, tight);
    const none = serverModuleSelection(dir, 'index.js', false, tight);
    assert.equal(all.sourceMaps.droppedCount, 0);
    assert.ok(dropped.sourceMaps.droppedCount > 0);
    assert.equal(none.sourceMaps, null);
    assert.deepEqual(nonMaps(dropped.modules), nonMaps(all.modules));
    assert.deepEqual(nonMaps(none.modules), nonMaps(all.modules));
    assert.deepEqual(Object.keys(nonMaps(all.modules)).sort(), [
      'assets/a.js',
      'assets/b.js',
      'assets/data.bin',
      'index.js',
    ]);
    // 1200 > 1000: index (400) then a (300) = 700 <= 900; b (500) is dropped.
    assert.deepEqual(dropped.sourceMaps.kept, [
      'assets/a.js.map',
      'index.js.map',
    ]);
    assert.deepEqual(dropped.sourceMaps.dropped, [
      { name: 'assets/b.js.map', bytes: 500 },
    ]);
    assert.equal(dropped.modules['assets/b.js.map'], undefined);
    assert.equal(all.modules['orphan.js.map'], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the emitted Build Output and its receipt agree on the dropped maps', async () => {
  const { root, dir } = server();
  try {
    writeFileSync(
      join(dir, 'emitted.json'),
      JSON.stringify({
        name: 'maps-worker',
        main: 'index.js',
        no_bundle: true,
        compatibility_date: '2026-09-06',
        compatibility_flags: ['nodejs_compat'],
        workers_dev: false,
        preview_urls: false,
        upload_source_maps: true,
        vars: {},
        observability: { enabled: true, head_sampling_rate: 0.05 },
      })
    );
    const emit = (name, budget) =>
      emitVoidCfOutput({
        configPath: join(dir, 'emitted.json'),
        destination: join(root, name),
        sourceSha: 'a'.repeat(40),
        sourceMapBudgetOverride: budget,
      });
    const tight = await emit(
      'tight',
      sourceMapBudget({
        sourcemapEncodedBytes: 1000,
        sourcemapGzipBytes: 1_000_000,
      })
    );
    const roomy = await emit('roomy');
    const receipt = JSON.parse(
      readFileSync(join(root, 'tight', 'void-cf-receipt.json'), 'utf8')
    );
    assert.deepEqual(receipt.sourceMaps.dropped, [
      { name: 'assets/b.js.map', bytes: 500 },
    ]);
    assert.equal(receipt.sourceMaps.droppedBytes, 500);
    const bundle = '.cloudflare/output/v0/workers/default/bundle/';
    assert.equal(tight.files[`${bundle}assets/b.js.map`], undefined);
    assert.ok(tight.files[`${bundle}assets/a.js.map`]);
    // Every JS module ships byte-identical whether or not maps were dropped.
    for (const name of ['index.js', 'assets/a.js', 'assets/b.js'])
      assert.equal(
        tight.files[`${bundle}${name}`],
        roomy.files[`${bundle}${name}`]
      );
    assert.deepEqual(
      nonMaps(tight.workerConfig.manifest.modules),
      nonMaps(roomy.workerConfig.manifest.modules)
    );
    // The dry-run measurement sees exactly the maps the emit kept, so it and
    // the upload agree; the JS module measurement is unchanged.
    const measured = (name) =>
      measureBuildOutputUpload(join(dir, 'emitted.json'), join(root, name));
    const tightMeasured = measured('tight');
    const roomyMeasured = measured('roomy');
    assert.equal(tightMeasured.sourcemaps.count, receipt.sourceMaps.keptCount);
    assert.equal(
      tightMeasured.sourcemaps.encodedBytes,
      receipt.sourceMaps.keptBytes
    );
    assert.equal(roomyMeasured.sourcemaps.count, 3);
    assert.deepEqual(tightMeasured.script, roomyMeasured.script);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
