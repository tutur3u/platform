import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { lstatSync } from 'node:fs';
import {
  assertUploadNameParity,
  BUILD_OUTPUT_PREFIX,
  buildOutputObservability,
  cfBundleSecondaryModuleNames,
  discoverCfBuildOutputEsmModules,
} from './cf-build-output-publisher.mjs';

test('Wave-1 publisher entry-module parity excludes the main module from upload checks', (t) => {
  const buildRoot = mkdtempSync(join(tmpdir(), 'cf-build-output-entry-'));
  t.after(() => {
    // mkdtemp is cleaned by the OS; no recursive import needed for this unit.
  });
  const bundle = join(buildRoot, BUILD_OUTPUT_PREFIX, 'workers/default/bundle');
  mkdirSync(join(bundle, 'chunks'), { recursive: true });
  writeFileSync(join(bundle, 'index.js'), 'export default {};\n');
  writeFileSync(join(bundle, 'chunks', 'shared.js'), 'export const x = 1;\n');
  writeFileSync(
    join(buildRoot, BUILD_OUTPUT_PREFIX, 'workers/default/worker.config.json'),
    JSON.stringify({
      manifest: {
        type: 'complete',
        mainModule: 'index.js',
        modules: {
          'index.js': { type: 'esm' },
          'chunks/shared.js': { type: 'esm' },
        },
      },
    })
  );
  assert.deepEqual(cfBundleSecondaryModuleNames(buildRoot), [
    'chunks/shared.js',
  ]);
  const receipt = {
    secondaryModuleNames: [
      { source: 'chunks/shared.js', cfUpload: './chunks/shared.js' },
    ],
  };
  assert.doesNotThrow(() =>
    assertUploadNameParity(receipt, cfBundleSecondaryModuleNames(buildRoot))
  );
  assert.throws(
    () => assertUploadNameParity(receipt, ['index.js', 'chunks/shared.js']),
    /cf Build Output bundle modules differ/
  );
});

test('buildOutputObservability maps Wrangler head sampling fields', () => {
  assert.deepEqual(
    buildOutputObservability({
      enabled: true,
      head_sampling_rate: 0.05,
      logs: { enabled: true, head_sampling_rate: 0.01, invocationLogs: true },
    }),
    {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.01, invocationLogs: true },
    }
  );
});

test('discoverCfBuildOutputEsmModules prefers the Vite manifest module graph', () => {
  const bundleRoot = mkdtempSync(join(tmpdir(), 'cf-build-output-vite-graph-'));
  mkdirSync(join(bundleRoot, 'assets'), { recursive: true });
  mkdirSync(join(bundleRoot, '.vite'), { recursive: true });
  writeFileSync(join(bundleRoot, 'assets', 'index.js'), 'export default {};\n');
  writeFileSync(join(bundleRoot, 'assets', 'orphan.js'), 'export const x=1;\n');
  writeFileSync(
    join(bundleRoot, '.vite', 'manifest.json'),
    JSON.stringify({
      entry: {
        file: 'assets/index.js',
        isEntry: true,
        imports: ['chunk'],
      },
      chunk: { file: 'assets/chunk.js', imports: [] },
    })
  );
  writeFileSync(join(bundleRoot, 'assets', 'chunk.js'), 'export const y=1;\n');
  const modules = discoverCfBuildOutputEsmModules(
    bundleRoot,
    { rules: [{ globs: ['**/*'] }] },
    'assets/index.js'
  );
  assert.deepEqual(Object.keys(modules).sort(), [
    'assets/chunk.js',
    'assets/index.js',
  ]);
});

test('discoverCfBuildOutputEsmModules respects Wrangler globs without widening', () => {
  const bundleRoot = mkdtempSync(join(tmpdir(), 'cf-build-output-globs-'));
  mkdirSync(join(bundleRoot, 'assets'), { recursive: true });
  writeFileSync(join(bundleRoot, 'index.mjs'), 'export default {};\n');
  writeFileSync(join(bundleRoot, 'assets', 'chunk.js'), 'export const x=1;\n');
  const narrow = discoverCfBuildOutputEsmModules(
    bundleRoot,
    { rules: [{ globs: ['**/*.mjs'] }] },
    'index.mjs'
  );
  assert.deepEqual(Object.keys(narrow).sort(), ['index.mjs']);
  const wide = discoverCfBuildOutputEsmModules(
    bundleRoot,
    { rules: [{ globs: ['**/*.js', '**/*.mjs'] }] },
    'index.mjs'
  );
  assert.deepEqual(Object.keys(wide).sort(), ['assets/chunk.js', 'index.mjs']);
});

test('discoverCfBuildOutputEsmModules skips dot directories', (t) => {
  const bundleRoot = mkdtempSync(join(tmpdir(), 'cf-build-output-dotdir-'));
  mkdirSync(join(bundleRoot, '.vite'), { recursive: true });
  writeFileSync(join(bundleRoot, 'index.js'), 'export default {};\n');
  writeFileSync(
    join(bundleRoot, '.vite', 'metadata.js'),
    'export const x=1;\n'
  );
  const modules = discoverCfBuildOutputEsmModules(
    bundleRoot,
    { rules: [{ globs: ['**/*'] }] },
    'index.js'
  );
  assert.deepEqual(Object.keys(modules), ['index.js']);
});

test('discoverCfBuildOutputEsmModules skips directories under broad globs', (t) => {
  const bundleRoot = mkdtempSync(join(tmpdir(), 'cf-build-output-modules-'));
  mkdirSync(join(bundleRoot, 'chunks'), { recursive: true });
  writeFileSync(join(bundleRoot, 'index.js'), 'export default {};\n');
  writeFileSync(join(bundleRoot, 'chunks', 'shared.js'), 'export const x=1;\n');
  const modules = discoverCfBuildOutputEsmModules(
    bundleRoot,
    { rules: [{ globs: ['**/*'] }] },
    'index.js'
  );
  assert.deepEqual(Object.keys(modules).sort(), [
    'chunks/shared.js',
    'index.js',
  ]);
  for (const name of Object.keys(modules)) {
    assert.ok(
      lstatSync(join(bundleRoot, name)).isFile(),
      `${name} must be a file`
    );
  }
});
