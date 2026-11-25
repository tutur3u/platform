import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
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
  globToRegExp,
  hasComputedDynamicImport,
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

test('discoverCfBuildOutputEsmModules emits sealed modules and excludes only listed orphans', () => {
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
  const rules = { rules: [{ globs: ['**/*'] }] };
  assert.deepEqual(
    Object.keys(
      discoverCfBuildOutputEsmModules(bundleRoot, rules, 'assets/index.js')
    ),
    ['assets/chunk.js', 'assets/index.js', 'assets/orphan.js']
  );
  const modules = discoverCfBuildOutputEsmModules(
    bundleRoot,
    rules,
    'assets/index.js',
    { excludedOrphans: ['assets/orphan.js'] }
  );
  assert.deepEqual(Object.keys(modules), [
    'assets/chunk.js',
    'assets/index.js',
  ]);
  assert.throws(
    () =>
      discoverCfBuildOutputEsmModules(bundleRoot, rules, 'assets/index.js', {
        excludedOrphans: ['assets/chunk.js'],
      }),
    /excluded orphan is in the Vite graph: assets\/chunk\.js/
  );
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
  const rules = { rules: [{ globs: ['**/*.js', '**/*.mjs'] }] };
  const modules = discoverCfBuildOutputEsmModules(root, rules, 'index.mjs', {
    excludedOrphans: ['assets/orphan.js'],
  });
  assert.deepEqual(Object.keys(modules), [
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

test('excluding orphans fails when a relative import path is computed', () => {
  const root = rscLayout();
  writeFileSync(
    join(root, 'rsc/bridge-api.js'),
    'const n="route";export const h=()=>import(`./assets/${n}.js`);\n'
  );
  const rules = { rules: [{ globs: ['**/*.js', '**/*.mjs'] }] };
  // Everything sealed is emitted, so the computed import still resolves.
  assert.ok(
    Object.hasOwn(
      discoverCfBuildOutputEsmModules(root, rules, 'index.mjs'),
      'rsc/assets/route.js'
    )
  );
  assert.throws(
    () =>
      discoverCfBuildOutputEsmModules(root, rules, 'index.mjs', {
        excludedOrphans: ['assets/orphan.js'],
      }),
    /computed dynamic import in rsc\/bridge-api\.js forbids excluding orphans/
  );
});

test('an import that leaves the root or enters a dot directory fails emission', () => {
  const parent = mkdtempSync(join(tmpdir(), 'cf-build-output-escape-'));
  const root = join(parent, 'server');
  mkdirSync(join(root, '.hidden'), { recursive: true });
  writeFileSync(join(parent, 'outside.js'), 'export {};\n');
  writeFileSync(join(root, '.hidden/x.js'), 'export {};\n');
  const rules = { rules: [{ globs: ['**/*'] }] };
  writeFileSync(
    join(root, 'index.mjs'),
    'import("./missing.js");/** @import {T} from "./types.js" */export default {};\n'
  );
  assert.deepEqual(
    Object.keys(discoverCfBuildOutputEsmModules(root, rules, 'index.mjs')),
    ['index.mjs']
  );
  writeFileSync(
    join(root, 'index.mjs'),
    'import("../outside.js");export default {};\n'
  );
  assert.throws(
    () => discoverCfBuildOutputEsmModules(root, rules, 'index.mjs'),
    /index\.mjs -> \.\.\/outside\.js/
  );
  writeFileSync(
    join(root, 'index.mjs'),
    'import("./.hidden/x.js?v=1");export default {};\n'
  );
  assert.throws(
    () => discoverCfBuildOutputEsmModules(root, rules, 'index.mjs'),
    /index\.mjs -> \.hidden\/x\.js/
  );
});

test('a symlinked bundle directory is refused', () => {
  const parent = mkdtempSync(join(tmpdir(), 'cf-build-output-symlink-'));
  const root = join(parent, 'server');
  mkdirSync(join(parent, 'elsewhere'), { recursive: true });
  mkdirSync(root, { recursive: true });
  writeFileSync(join(parent, 'elsewhere/bridge-api.js'), 'export {};\n');
  symlinkSync(join(parent, 'elsewhere'), join(root, 'rsc'));
  writeFileSync(
    join(root, 'index.mjs'),
    'import("./rsc/bridge-api.js");export default {};\n'
  );
  assert.throws(
    () =>
      discoverCfBuildOutputEsmModules(
        root,
        { rules: [{ globs: ['**/*'] }] },
        'index.mjs'
      ),
    /bundle symlink forbidden/
  );
});

test('assertUploadedModuleSet compares a published version with the emitted manifest', () => {
  const expected = {
    'index.mjs': { type: 'esm' },
    'rsc/bridge-api.js': { type: 'esm' },
  };
  assertUploadedModuleSet(
    ['./index.mjs', '/rsc/bridge-api.js', './_headers'],
    expected
  );
  assertUploadedModuleSet(['index.mjs', 'rsc\\bridge-api.js'], expected);
  assert.throws(
    () => assertUploadedModuleSet(['./index.mjs'], expected),
    /uploaded modules differ from the emitted manifest \(1 uploaded, 2 expected\)/
  );
  assert.throws(
    () =>
      assertUploadedModuleSet(
        ['./index.mjs', './rsc/bridge-api.js', './extra.js'],
        expected
      ),
    /\(3 uploaded, 2 expected\)/
  );
  assert.throws(
    () =>
      assertUploadedModuleSet(
        ['./index.mjs', 'index.mjs', './rsc/bridge-api.js'],
        expected
      ),
    /uploaded module names repeat/
  );
});

test('globToRegExp matches deploy rule globs against the relative path', () => {
  const cases = [
    ['**/*.js', 'a/b.js', true],
    ['**/*.js', 'b.js', true],
    ['**/*.{js,mjs}', 'x/y.mjs', true],
    ['**/*.{js,mjs}', 'x/y.cjs', false],
    ['*.mjs', 'index.mjs', true],
    ['*.mjs', 'a/b.mjs', false],
    ['a.b.js', 'axbxjs', false],
    ['chunk-?.js', 'chunk-1.js', true],
    ['**/{*.js,*.mjs}', 'a/b.mjs', true],
    ['**/{a,{b,c}}.js', 'x/c.js', true],
    ['**/{a,{b,c}}.js', 'x/d.js', false],
    ['{a?,b}.js', 'ax.js', true],
    ['{a?,b}.js', 'a.js', false],
  ];
  for (const [glob, path, expected] of cases)
    assert.equal(globToRegExp(glob).test(path), expected, `${glob} ~ ${path}`);
});

test('hasComputedDynamicImport flags any non-constant import argument', () => {
  for (const source of [
    'import(v)',
    'import("./"+x)',
    'import(`${base}/x.js`)',
    'import(`./rsc/${n}.js`)',
  ])
    assert.equal(hasComputedDynamicImport(source), true, source);
  for (const source of [
    'import("./a.js")',
    'import(`./rsc/bridge-api.js`)',
    'import(/* @vite-ignore */ "./a.js", { with: {} })',
    'const u = import.meta.url',
  ])
    assert.equal(hasComputedDynamicImport(source), false, source);
});

test('excluding orphans fails for a variable or concatenated import', () => {
  const root = rscLayout();
  const rules = { rules: [{ globs: ['**/*.js', '**/*.mjs'] }] };
  for (const body of [
    'const p="./assets/route.js";export const h=()=>import(p);\n',
    'const n="route";export const h=()=>import("./assets/"+n+".js");\n',
  ]) {
    writeFileSync(join(root, 'rsc/bridge-api.js'), body);
    assert.throws(
      () =>
        discoverCfBuildOutputEsmModules(root, rules, 'index.mjs', {
          excludedOrphans: ['assets/orphan.js'],
        }),
      /computed dynamic import in rsc\/bridge-api\.js forbids excluding orphans/
    );
  }
});

test('an import of an existing non-ESM file fails emission', () => {
  const root = mkdtempSync(join(tmpdir(), 'cf-build-output-wasm-'));
  writeFileSync(join(root, 'engine.wasm'), 'wasm');
  writeFileSync(
    join(root, 'index.mjs'),
    'import engine from "./engine.wasm";export default {engine};\n'
  );
  assert.throws(
    () =>
      discoverCfBuildOutputEsmModules(
        root,
        { rules: [{ globs: ['**/*.js', '**/*.mjs'] }] },
        'index.mjs'
      ),
    /non-ESM modules are unsupported by this emit: index\.mjs -> engine\.wasm/
  );
});

test('assertModuleClosure resolves symlinked directories by real path', () => {
  const parent = mkdtempSync(join(tmpdir(), 'cf-build-output-realpath-'));
  const root = join(parent, 'server');
  mkdirSync(join(parent, 'elsewhere'), { recursive: true });
  mkdirSync(root, { recursive: true });
  writeFileSync(join(parent, 'elsewhere/bridge-api.js'), 'export {};\n');
  symlinkSync(join(parent, 'elsewhere'), join(root, 'rsc'));
  writeFileSync(
    join(root, 'index.mjs'),
    'import("./rsc/bridge-api.js");export default {};\n'
  );
  assert.throws(
    () => assertModuleClosure(root, { 'index.mjs': { type: 'esm' } }),
    /index\.mjs -> rsc\/bridge-api\.js/
  );
});

test('globToRegExp rejects unbalanced braces with the glob named', () => {
  assert.throws(
    () => globToRegExp('**/{a,b.js'),
    /unclosed "\{" in module glob: \*\*\/\{a,b\.js/
  );
  assert.throws(
    () => globToRegExp('**/a}.js'),
    /unbalanced "\}" in module glob/
  );
});

test('closure ignores directories and non-ESM files outside the root', () => {
  const parent = mkdtempSync(join(tmpdir(), 'cf-build-output-noise-'));
  const root = join(parent, 'dist/server');
  mkdirSync(join(root, 'dir'), { recursive: true });
  writeFileSync(join(parent, 'package.json'), '{}');
  writeFileSync(
    join(root, 'index.mjs'),
    '// see from "./dir/" and from "../../package.json"\nimport("./dir/");export default {};\n'
  );
  assert.deepEqual(
    Object.keys(
      discoverCfBuildOutputEsmModules(
        root,
        { rules: [{ globs: ['**/*'] }] },
        'index.mjs'
      )
    ),
    ['index.mjs']
  );
});

test('hasComputedDynamicImport documents its textual limits', () => {
  // Over-reports (only blocks orphan exclusion): a method named import.
  assert.equal(hasComputedDynamicImport('obj.import(x)'), true);
  // Under-reports: a comment between import and "(" and CommonJS require.
  assert.equal(hasComputedDynamicImport('import /* c */ (x)'), false);
  assert.equal(hasComputedDynamicImport('require(x)'), false);
  // Constant specifiers inside strings or comments stay constant.
  assert.equal(hasComputedDynamicImport('"import(\'./a.js\')"'), false);
});
