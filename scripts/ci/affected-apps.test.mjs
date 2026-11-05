import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calculate, coveredByExtraEdges, loadExtraEdges, loadGraph, verdict } from './affected-apps.mjs';
import { isTestOnlyFile, scanCrossWorkspaceImports, suggestEdges, undeclaredImports } from './affected-apps-imports.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function fixture() {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'affected-apps-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  const pkg = (dir, name, deps = {}, fields = {}) => {
    mkdirSync(path.join(cwd, dir), { recursive: true });
    writeFileSync(path.join(cwd, dir, 'package.json'), JSON.stringify({ name, dependencies: deps, ...fields }));
    writeFileSync(path.join(cwd, dir, 'index.js'), 'export {};\n');
  };
  // Folder without a package.json (apps/docs, apps/backend, ...).
  const standalone = (dir) => { mkdirSync(path.join(cwd, dir), { recursive: true }); writeFileSync(path.join(cwd, dir, 'index.mdx'), 'hello\n'); };
  pkg('packages/core', '@x/core'); pkg('packages/ui', '@x/ui', { '@x/core': 'workspace:*' });
  standalone('apps/docs'); standalone('apps/backend');
  pkg('apps/alpha', '@x/alpha', { '@x/ui': 'workspace:*' }); pkg('apps/beta', '@x/beta', { '@x/core': 'workspace:*' });
  const commit = (message) => { git('add', '.'); git('commit', '-qm', message); return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(); };
  const initial = commit('initial');
  const change = (file, value = 'changed\n') => { mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); writeFileSync(path.join(cwd, file), value); return commit(file); };
  const move = (from, to) => { mkdirSync(path.dirname(path.join(cwd, to)), { recursive: true }); git('mv', from, to); return commit(`${from} -> ${to}`); };
  return { cwd, git, pkg, standalone, commit, move, initial, change, close: () => rmSync(cwd, { recursive: true, force: true }) };
}

test('shared package changes select direct and transitive dependent apps', () => {
  const f = fixture(); try { const head = f.change('packages/core/index.js'); assert.deepEqual(calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head }), { mode: 'affected', apps: ['apps/alpha', 'apps/beta'], reason: 'workspace and documentation changes' }); } finally { f.close(); }
});
test('single app change selects only that app', () => {
  const f = fixture(); try { assert.deepEqual(calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head: f.change('apps/beta/index.js') }).apps, ['apps/beta']); } finally { f.close(); }
});
for (const file of ['bun.lock', 'package.json', 'turbo.json', '.github/ci.yml', 'tsconfig.json', 'biome.json', 'eslint.config.js', 'apps/alpha/Dockerfile', '.env.local', 'apps/alpha/.env.example', 'scripts/tool.js']) {
  test(`fails safe for ${file}`, () => { const f = fixture(); try { const head = f.change(file); assert.equal(calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head }).mode, 'all'); } finally { f.close(); } });
}
test('unresolvable base fails safe', () => { const f = fixture(); try { assert.equal(calculate({ extraEdges: {}, cwd: f.cwd, base: 'missing-ref' }).mode, 'all'); } finally { f.close(); } });
test('docs-only changes select no apps', () => { const f = fixture(); try { const result = calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head: f.change('docs/guide.md') }); assert.equal(result.mode, 'affected'); assert.deepEqual(result.apps, []); } finally { f.close(); } });
test('root non-doc file fails safe', () => { const f = fixture(); try { assert.equal(calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head: f.change('NOTICE') }).mode, 'all'); } finally { f.close(); } });
test('verdict blocks skip-to-green and any non-success app result', () => {
  assert.equal(verdict({ mode: 'affected', apps: [], codeChanged: true, results: {} }).pass, false);
  assert.equal(verdict({ mode: 'affected', apps: ['apps/a'], codeChanged: true, results: { 'apps/a': 'failure' } }).pass, false);
  assert.equal(verdict({ mode: 'affected', apps: ['apps/a'], codeChanged: true, results: { 'apps/a': 'success' } }).pass, true);
});
test('mode all requires the full app list and a success for every listed app', () => {
  assert.deepEqual(verdict({ mode: 'all', apps: [], codeChanged: true, results: {} }), { pass: false, reason: 'fail-safe all needs the full app list' });
  assert.equal(verdict({ mode: 'all', apps: [], codeChanged: true, results: { a: 'success', b: 'success' } }).pass, false);
  assert.equal(verdict({ mode: 'all', apps: ['a', 'b'], codeChanged: true, results: { a: 'success', b: 'success' } }).pass, true);
  assert.deepEqual(verdict({ mode: 'all', apps: ['a', 'b'], codeChanged: true, results: { a: 'success' } }), { pass: false, reason: 'b result was missing' });
  assert.equal(verdict({ mode: 'all', apps: ['a', 'b'], codeChanged: true, results: { a: 'success', b: 'failure' } }).pass, false);
  assert.equal(verdict({ mode: 'all', apps: ['a'], codeChanged: true, results: { a: 'success', extra: 'cancelled' } }).pass, false);
});
test('loadGraph with a ref reads manifests from that commit, not the working copy', () => {
  const f = fixture(); try {
    writeFileSync(path.join(f.cwd, 'apps/beta/package.json'), JSON.stringify({ name: '@x/beta', dependencies: { '@x/ui': 'workspace:*' } }));
    assert.equal(loadGraph(f.cwd).declares('apps/beta', 'packages/ui'), true);
    assert.equal(loadGraph(f.cwd, 'HEAD').declares('apps/beta', 'packages/ui'), false);
    assert.equal(loadGraph(f.cwd, 'HEAD').declares('apps/beta', 'packages/core'), true);
  } finally { f.close(); }
});
test('docs-only classification is based on documentation extensions', () => {
  const f = fixture(); try {
    const markdown = calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head: f.change('docs/a.md') });
    assert.equal(markdown.mode, 'affected');
    assert.deepEqual(markdown.apps, []);
    assert.equal(calculate({ extraEdges: {}, cwd: f.cwd, base: f.initial, head: f.change('docs/build.mjs') }).mode, 'all');
  } finally { f.close(); }
});
test('base graph dependents survive removing their shared package at head', () => {
  const f = fixture(); try {
    f.git('rm', '-qr', 'packages/core'); const head = f.commit('remove core');
    assert.deepEqual(run(f, head).apps, ['apps/alpha', 'apps/beta']);
  } finally { f.close(); }
});
test('base graph dependents survive renaming their shared package at head', () => {
  const f = fixture(); try {
    f.git('mv', 'packages/core', 'packages/kernel'); const head = f.commit('rename core');
    assert.deepEqual(run(f, head).apps, ['apps/alpha', 'apps/beta']);
  } finally { f.close(); }
});

const run = (f, head, extraEdges = {}, base = f.initial) => calculate({ cwd: f.cwd, base, head, extraEdges });

// 1. renames report both paths
test('renaming a file out of one app into another marks both apps', () => {
  const f = fixture(); try {
    const head = f.move('apps/alpha/index.js', 'apps/beta/moved.js');
    assert.deepEqual(run(f, head), { mode: 'affected', apps: ['apps/alpha', 'apps/beta'], reason: 'workspace and documentation changes' });
  } finally { f.close(); }
});
test('renaming a file within an app marks only that app', () => {
  const f = fixture(); try { assert.deepEqual(run(f, f.move('apps/beta/index.js', 'apps/beta/renamed.js')).apps, ['apps/beta']); } finally { f.close(); }
});
test('renaming a file out of a shared package still marks the package dependents', () => {
  const f = fixture(); try { assert.deepEqual(run(f, f.move('packages/core/index.js', 'apps/beta/core-moved.js')).apps, ['apps/alpha', 'apps/beta']); } finally { f.close(); }
});

// 2. undeclared cross-workspace imports
function extraEdgeFixture() {
  const f = fixture();
  f.pkg('packages/utils', '@x/utils'); f.pkg('apps/coordination', '@x/coordination');
  f.pkg('apps/apps', '@x/apps'); f.pkg('apps/finance', '@x/finance'); f.pkg('apps/pay', '@x/pay');
  const base = f.commit('extra edge workspaces');
  return Object.assign(f, { initial: base });
}
const KNOWN_EDGES = { 'packages/utils/src/': ['apps/coordination'], 'apps/apps/cloudflare/': ['apps/finance', 'apps/pay'] };
test('packages/utils change selects apps/coordination only through the extra edge', () => {
  const f = extraEdgeFixture(); try {
    const head = f.change('packages/utils/src/coordination-protocol.ts');
    assert.deepEqual(run(f, head).apps, []);
    assert.deepEqual(run(f, head, KNOWN_EDGES).apps, ['apps/coordination']);
  } finally { f.close(); }
});
test('native-browser-fence change selects finance and pay; other apps/apps changes do not', () => {
  const f = extraEdgeFixture(); try {
    const fence = f.change('apps/apps/cloudflare/native-browser-fence.mjs');
    assert.deepEqual(run(f, fence, KNOWN_EDGES).apps, ['apps/apps', 'apps/finance', 'apps/pay']);
    assert.deepEqual(run(f, f.change('apps/apps/index.js'), KNOWN_EDGES, fence).apps, ['apps/apps']);
  } finally { f.close(); }
});
test('extra edges propagate through the graph and apply to renamed-from paths', () => {
  const f = extraEdgeFixture(); try {
    const edges = { 'packages/utils/src/': ['packages/ui'] };
    f.change('packages/utils/src/a.ts'); const base = f.change('packages/utils/src/b.ts', 'b\n');
    const head = f.move('packages/utils/src/b.ts', 'apps/beta/b.ts');
    assert.deepEqual(calculate({ cwd: f.cwd, base, head, extraEdges: edges }).apps, ['apps/alpha', 'apps/beta']);
  } finally { f.close(); }
});
test('an extra edge naming an unknown workspace fails safe', () => {
  const f = extraEdgeFixture(); try { assert.equal(run(f, f.change('packages/utils/src/a.ts'), { 'packages/utils/src/': ['apps/missing'] }).mode, 'all'); } finally { f.close(); }
});
test('the extra-edges loader rejects a missing file', () => {
  const f = fixture(); try { assert.throws(() => loadExtraEdges(path.join(f.cwd, 'nope.json'))); } finally { f.close(); }
});
test('the committed extra-edges file covers the known undeclared imports and names real workspaces', () => {
  const edges = loadExtraEdges();
  assert.equal(coveredByExtraEdges(edges, 'packages/utils/src/coordination-protocol', 'apps/coordination'), true);
  for (const app of ['apps/finance', 'apps/pay']) assert.equal(coveredByExtraEdges(edges, 'apps/apps/cloudflare/native-browser-fence.mjs', app), true);
  const { dirs } = loadGraph(repoRoot);
  for (const [prefix, dependents] of Object.entries(edges)) for (const dep of dependents) assert.ok(dirs.includes(dep), `${prefix} names unknown workspace ${dep}`);
});
test('scanner finds a new undeclared relative import and the extra-edges check rejects it until listed', () => {
  const f = fixture(); try {
    f.change('apps/alpha/src/uses-core.ts', "import { x } from '../../../packages/core/index.js';\n");
    f.change('apps/alpha/src/uses-core.test.ts', "import { x } from '../../../packages/core/index.js';\n");
    f.change('apps/alpha/src/declared.ts', "import { x } from '../../../packages/ui/index.js';\n");
    const found = scanCrossWorkspaceImports(f.cwd);
    const missing = undeclaredImports(found, loadGraph(f.cwd).declares);
    assert.deepEqual(missing.map((m) => [m.importer, m.workspace, m.file]).sort((a, b) => a[2].localeCompare(b[2])), [
      ['apps/alpha', 'packages/core', 'apps/alpha/src/uses-core.test.ts'],
      ['apps/alpha', 'packages/core', 'apps/alpha/src/uses-core.ts'],
    ]);
    const suggestion = suggestEdges(missing);
    assert.deepEqual(suggestion, { 'packages/core/': ['apps/alpha'] });
    assert.equal(coveredByExtraEdges({}, missing[0].target, 'apps/alpha'), false);
    assert.equal(coveredByExtraEdges(suggestion, missing[0].target, 'apps/alpha'), true);
  } finally { f.close(); }
});
test('isTestOnlyFile matches test filenames and runner configs, never a test directory', () => {
  for (const file of ['a/b.test.ts', 'a/b.spec.tsx', 'a/b.e2e.ts', 'a/vitest.config.ts', 'a/playwright.config.ts', 'a/jest.config.ts']) assert.equal(isTestOnlyFile(file), true, file);
  for (const file of ['a/__tests__/x.ts', 'a/tests/x.ts', 'a/test/helper.ts', 'apps/x/e2e/fixtures/y.ts', 'apps/x/e2e-staging/y.ts', 'a/src/runtime.ts', 'a/tests/runtime.ts', 'a/e2e/runtime.ts', 'a/vite.config.ts', 'apps/finance/cloudflare/native-built-worker.runtime.mjs', 'a/src/latest.ts']) assert.equal(isTestOnlyFile(file), false, file);
});
test('a test file in apps/x importing packages/utils marks x affected', () => {
  const f = fixture(); try {
    f.pkg('packages/utils', '@x/utils');
    f.pkg('apps/x', '@x/x');
    f.change('apps/x/e2e/helper.ts', "import { y } from '../../../packages/utils/index.js';\n");
    const base = f.change('apps/x/import.test.ts', "import { y } from '../../packages/utils/index.js';\n");
    const head = f.change('packages/utils/index.js', 'export const y = 1;\n');
    const missing = undeclaredImports(scanCrossWorkspaceImports(f.cwd), loadGraph(f.cwd).declares);
    assert.ok(missing.some(({ importer, workspace, file }) => importer === 'apps/x' && workspace === 'packages/utils' && file === 'apps/x/import.test.ts'));
    assert.ok(missing.some(({ importer, file }) => importer === 'apps/x' && file === 'apps/x/e2e/helper.ts'));
    const edges = suggestEdges(missing);
    assert.deepEqual(run(f, head, {}, base).apps, []);
    assert.deepEqual(run(f, head, edges, base).apps, ['apps/x']);
  } finally { f.close(); }
});
test('every undeclared cross-workspace relative import in the repo is listed in affected-apps.extra-edges.json', () => {
  const edges = loadExtraEdges();
  const missing = undeclaredImports(scanCrossWorkspaceImports(repoRoot), loadGraph(repoRoot).declares)
    .filter(({ importer, target }) => !coveredByExtraEdges(edges, target, importer));
  assert.deepEqual(missing.map(({ file, target }) => `${file} -> ${target}`), [],
    `Add these to scripts/ci/affected-apps.extra-edges.json (or declare a package.json dependency):\n${JSON.stringify(suggestEdges(missing), null, 2)}`);
});

// 3. folders without package.json
test('a change only in a folder without package.json selects just that folder', () => {
  const f = fixture(); try {
    const docs = f.change('apps/docs/index.mdx');
    assert.deepEqual(run(f, docs), { mode: 'affected', apps: ['apps/docs'], reason: 'workspace and documentation changes' });
    assert.deepEqual(run(f, f.change('apps/backend/src/lib.rs'), {}, docs).apps, ['apps/backend']);
  } finally { f.close(); }
});
test('folders without package.json never force mode all for other changes', () => {
  const f = fixture(); try { assert.deepEqual(run(f, f.change('apps/beta/index.js')).apps, ['apps/beta']); } finally { f.close(); }
});
test('a package.json-less folder imported by another workspace propagates via extra edges', () => {
  const f = fixture(); try { assert.deepEqual(run(f, f.change('apps/docs/index.mdx'), { 'apps/docs/': ['apps/alpha'] }).apps, ['apps/alpha', 'apps/docs']); } finally { f.close(); }
});
test('package.json-less folders are still units in a sparse checkout that omits them', () => {
  const f = fixture(); try {
    const head = f.change('apps/docs/index.mdx');
    rmSync(path.join(f.cwd, 'apps/docs'), { recursive: true, force: true });
    assert.deepEqual(run(f, head).apps, ['apps/docs']);
    assert.deepEqual(run(f, head, { 'apps/docs/': ['apps/alpha'] }).apps, ['apps/alpha', 'apps/docs']);
  } finally { f.close(); }
});
test('the real repo graph treats package.json-less app folders as standalone units', () => {
  const { dirs, dependents } = loadGraph(repoRoot);
  for (const dir of ['apps/backend', 'apps/chat-realtime', 'apps/discord', 'apps/docs']) assert.ok(dirs.includes(dir), dir);
  assert.equal(dependents.get('apps/docs').size, 0);
});

// 4. optionalDependencies and the CLI guard
test('optionalDependencies are graph edges', () => {
  const f = fixture(); try {
    f.pkg('apps/gamma', '@x/gamma', {}, { optionalDependencies: { '@x/core': 'workspace:*' } });
    const base = f.commit('gamma');
    assert.deepEqual(calculate({ cwd: f.cwd, base, head: f.change('packages/core/index.js'), extraEdges: {} }).apps, ['apps/alpha', 'apps/beta', 'apps/gamma']);
  } finally { f.close(); }
});
test('the CLI runs when invoked by a path that file:// string concatenation would mangle', () => {
  const f = fixture(); const dir = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'affected apps cli '));
  try {
    for (const file of ['affected-apps.mjs']) copyFileSync(path.join(here, file), path.join(dir, file));
    writeFileSync(path.join(dir, 'affected-apps.extra-edges.json'), '{}');
    const head = f.change('apps/beta/index.js');
    f.git('update-ref', 'refs/heads/base', f.initial);
    const out = execFileSync('node', [path.join(dir, 'affected-apps.mjs'), '--base', 'base', '--head', head], { cwd: f.cwd, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), { mode: 'affected', apps: ['apps/beta'], reason: 'workspace and documentation changes' });
    const usage = execFileSync('node', [path.join(dir, 'affected-apps.mjs')], { cwd: f.cwd, encoding: 'utf8' });
    assert.equal(JSON.parse(usage).mode, 'all');
  } finally { f.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('importing the module as a library does not run the CLI', () => {
  const out = execFileSync('node', ['--input-type=module', '-e', `import ${JSON.stringify(path.join(here, 'affected-apps.mjs'))};`], { encoding: 'utf8' });
  assert.equal(out, '');
});
