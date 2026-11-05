import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { calculate, verdict } from './affected-apps.mjs';

function fixture() {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'affected-apps-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  const pkg = (dir, name, deps = {}) => {
    mkdirSync(path.join(cwd, dir), { recursive: true });
    writeFileSync(path.join(cwd, dir, 'package.json'), JSON.stringify({ name, dependencies: deps }));
    writeFileSync(path.join(cwd, dir, 'index.js'), 'export {};\n');
  };
  pkg('packages/core', '@x/core'); pkg('packages/ui', '@x/ui', { '@x/core': 'workspace:*' });
  pkg('apps/alpha', '@x/alpha', { '@x/ui': 'workspace:*' }); pkg('apps/beta', '@x/beta', { '@x/core': 'workspace:*' });
  const commit = (message) => { git('add', '.'); git('commit', '-qm', message); return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(); };
  const initial = commit('initial');
  const change = (file, value = 'changed\n') => { mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); writeFileSync(path.join(cwd, file), value); return commit(file); };
  return { cwd, initial, change, close: () => rmSync(cwd, { recursive: true, force: true }) };
}

test('shared package changes select direct and transitive dependent apps', () => {
  const f = fixture(); try { const head = f.change('packages/core/index.js'); assert.deepEqual(calculate({ cwd: f.cwd, base: f.initial, head }), { mode: 'affected', apps: ['apps/alpha', 'apps/beta'], reason: 'workspace and documentation changes' }); } finally { f.close(); }
});
test('single app change selects only that app', () => {
  const f = fixture(); try { assert.deepEqual(calculate({ cwd: f.cwd, base: f.initial, head: f.change('apps/beta/index.js') }).apps, ['apps/beta']); } finally { f.close(); }
});
for (const file of ['bun.lock', 'package.json', 'turbo.json', '.github/ci.yml', 'tsconfig.json', 'biome.json', 'eslint.config.js', 'apps/alpha/Dockerfile', '.env.local', 'apps/alpha/.env.example', 'scripts/tool.js']) {
  test(`fails safe for ${file}`, () => { const f = fixture(); try { const head = f.change(file); assert.equal(calculate({ cwd: f.cwd, base: f.initial, head }).mode, 'all'); } finally { f.close(); } });
}
test('unresolvable base fails safe', () => { const f = fixture(); try { assert.equal(calculate({ cwd: f.cwd, base: 'missing-ref' }).mode, 'all'); } finally { f.close(); } });
test('docs-only changes select no apps', () => { const f = fixture(); try { const result = calculate({ cwd: f.cwd, base: f.initial, head: f.change('docs/guide.md') }); assert.equal(result.mode, 'affected'); assert.deepEqual(result.apps, []); } finally { f.close(); } });
test('root non-doc file fails safe', () => { const f = fixture(); try { assert.equal(calculate({ cwd: f.cwd, base: f.initial, head: f.change('NOTICE') }).mode, 'all'); } finally { f.close(); } });
test('verdict blocks skip-to-green and any non-success app result', () => {
  assert.equal(verdict({ mode: 'affected', apps: [], codeChanged: true, results: {} }).pass, false);
  assert.equal(verdict({ mode: 'affected', apps: ['apps/a'], codeChanged: true, results: { 'apps/a': 'failure' } }).pass, false);
  assert.equal(verdict({ mode: 'affected', apps: ['apps/a'], codeChanged: true, results: { 'apps/a': 'success' } }).pass, true);
});
