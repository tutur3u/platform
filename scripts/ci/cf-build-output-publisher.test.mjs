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
