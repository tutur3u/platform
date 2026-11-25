import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { lstatSync } from 'node:fs';
import {
  assertModuleClosure,
  assertUploadedModuleSet,
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

/** A Vite RSC Worker: the ssr manifest omits the `rsc` environment's graph. */
function rscLayout() {
  const root = mkdtempSync(join(tmpdir(), 'cf-build-output-rsc-'));
  for (const dir of ['.vite', 'assets', 'rsc/assets'])
    mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(
    join(root, 'index.mjs'),
    'import{a}from"./assets/a.mjs";var DT=import(`./rsc/bridge-api.js`);import(/* @vite-ignore */ "./assets/lazy.js");export default{fetch:async()=>(await DT).h(a)};\n'
  );
  writeFileSync(join(root, 'assets/a.mjs'), 'export const a=1;\n');
  writeFileSync(join(root, 'assets/lazy.js'), 'export {};\n');
  writeFileSync(
    join(root, 'rsc/bridge-api.js'),
    'import"./assets/route.js";import m from"../__vite_rsc_assets_manifest.js";export const h=()=>m;\n'
  );
  writeFileSync(join(root, 'rsc/assets/route.js'), 'export {};\n');
  writeFileSync(
    join(root, '__vite_rsc_assets_manifest.js'),
    'export default {};\n'
  );
  writeFileSync(join(root, 'assets/orphan.js'), 'export const o=1;\n');
  writeFileSync(
    join(root, '.vite/manifest.json'),
    JSON.stringify({
      entry: { file: 'index.mjs', isEntry: true, imports: ['a'] },
      a: { file: 'assets/a.mjs' },
    })
  );
  return root;
}

test('discoverCfBuildOutputEsmModules keeps the Vite RSC graph the ssr manifest omits', () => {
  const root = rscLayout();
  const modules = discoverCfBuildOutputEsmModules(
    root,
    { rules: [{ globs: ['**/*.js', '**/*.mjs'] }] },
    'index.mjs'
  );
  assert.deepEqual(Object.keys(modules).sort(), [
    '__vite_rsc_assets_manifest.js',
    'assets/a.mjs',
    'assets/lazy.js',
    'index.mjs',
    'rsc/assets/route.js',
    'rsc/bridge-api.js',
  ]);
});

test('assertModuleClosure rejects a manifest-only set that drops the RSC graph', () => {
  const root = rscLayout();
  assert.throws(
    () =>
      assertModuleClosure(root, {
        'index.mjs': { type: 'esm' },
        'assets/a.mjs': { type: 'esm' },
      }),
    /drops imported modules: index\.mjs -> rsc\/bridge-api\.js/
  );
});

test('relative import walk never leaves the bundle root or enters dot directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'cf-build-output-escape-'));
  mkdirSync(join(root, '.vite'), { recursive: true });
  mkdirSync(join(root, '.hidden'), { recursive: true });
  writeFileSync(
    join(root, 'index.mjs'),
    'import("../outside.js");import("./.hidden/x.js");import("./missing.js");export default {};\n'
  );
  writeFileSync(join(root, '.hidden/x.js'), 'export {};\n');
  writeFileSync(
    join(root, '.vite/manifest.json'),
    JSON.stringify({ entry: { file: 'index.mjs', isEntry: true } })
  );
  const modules = discoverCfBuildOutputEsmModules(
    root,
    { rules: [{ globs: ['**/*'] }] },
    'index.mjs'
  );
  assert.deepEqual(Object.keys(modules), ['index.mjs']);
});

test('assertUploadedModuleSet compares a published version with the emitted manifest', () => {
  const expected = {
    'index.mjs': { type: 'esm' },
    'rsc/bridge-api.js': { type: 'esm' },
  };
  assertUploadedModuleSet(
    ['./index.mjs', './rsc/bridge-api.js', './_headers'],
    expected
  );
  assert.throws(
    () => assertUploadedModuleSet(['./index.mjs'], expected),
    /uploaded modules differ from the emitted manifest \(1 uploaded, 2 expected\)/
  );
});
