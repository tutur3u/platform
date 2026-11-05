import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decide, gate } from './affected-gate.mjs';

const affected = (apps) => ({ mode: 'affected', apps, reason: 'workspace and documentation changes' });

test('non-pull_request events always run, even with an unaffected result', () => {
  for (const eventName of ['push', 'workflow_dispatch', 'workflow_call', 'schedule', '']) {
    assert.equal(decide({ eventName, apps: 'cms', result: affected([]) }).run, true, eventName);
  }
});
test('pull_request runs when the app is listed', () => {
  assert.equal(decide({ eventName: 'pull_request', apps: 'cms', result: affected(['apps/cms']) }).run, true);
});
test('pull_request skips when the app is not listed', () => {
  assert.deepEqual(decide({ eventName: 'pull_request', apps: 'cms', result: affected(['apps/forms']) }), { run: false, reason: 'cms not affected' });
  assert.equal(decide({ eventName: 'pull_request', apps: 'cms', result: affected([]) }).run, false);
});
test('app names are matched exactly, not by prefix', () => {
  assert.equal(decide({ eventName: 'pull_request', apps: 'mail', result: affected(['apps/mail-extra']) }).run, false);
});
test('mode=all always runs', () => {
  assert.equal(decide({ eventName: 'pull_request', apps: 'cms', result: { mode: 'all', apps: [], reason: 'x' } }).run, true);
});
test('comma list runs when any app is affected', () => {
  assert.equal(decide({ eventName: 'pull_request', apps: 'mail, calendar', result: affected(['apps/calendar']) }).run, true);
  assert.equal(decide({ eventName: 'pull_request', apps: 'mail,calendar', result: affected(['apps/tasks']) }).run, false);
});
test('invalid or missing results, blank app and unknown app fail open', () => {
  for (const result of [undefined, null, 'x', {}, { mode: 'affected' }, { mode: 'weird', apps: [] }]) {
    assert.equal(decide({ eventName: 'pull_request', apps: 'cms', result }).run, true);
  }
  assert.equal(decide({ eventName: 'pull_request', apps: '', result: affected([]) }).run, true);
  assert.equal(decide({ eventName: 'pull_request', apps: ' , ', result: affected([]) }).run, true);
  assert.equal(decide({ eventName: 'pull_request', apps: 'ghost', result: affected([]), appExists: () => false }).run, true);
});

function repo() {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'affected-gate-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 't@example.com');
  for (const [dir, name] of [['packages/core', '@x/core'], ['apps/alpha', '@x/alpha'], ['apps/beta', '@x/beta']]) {
    mkdirSync(path.join(cwd, dir), { recursive: true });
    writeFileSync(path.join(cwd, dir, 'package.json'), JSON.stringify({ name, dependencies: dir === 'apps/alpha' ? { '@x/core': '1' } : {} }));
  }
  git('add', '.'); git('commit', '-qm', 'init');
  // `origin` is the repo itself so the gate's base fetch resolves locally.
  git('remote', 'add', 'origin', cwd); git('fetch', '-q', 'origin');
  git('checkout', '-q', '-b', 'pr');
  const change = (file) => { mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); writeFileSync(path.join(cwd, file), 'x\n'); git('add', '.'); git('commit', '-qm', file); };
  return { cwd, change, close: () => rmSync(cwd, { recursive: true, force: true }) };
}
const prEnv = (app) => ({ EVENT_NAME: 'pull_request', BASE_REF: 'main', APP: app });

test('gate end to end: unaffected app skips, affected and transitive apps run', () => {
  const r = repo(); try {
    r.change('apps/beta/index.js');
    assert.equal(gate(prEnv('alpha'), { cwd: r.cwd }).run, false);
    assert.equal(gate(prEnv('beta'), { cwd: r.cwd }).run, true);
    assert.equal(gate(prEnv('alpha,beta'), { cwd: r.cwd }).run, true);
    r.change('packages/core/index.js');
    assert.equal(gate(prEnv('alpha'), { cwd: r.cwd }).run, true);
  } finally { r.close(); }
});
test('gate end to end: fail-safe paths, unknown apps, missing/bad base and push all run', () => {
  const r = repo(); try {
    r.change('apps/beta/index.js');
    assert.equal(gate(prEnv('ghost'), { cwd: r.cwd }).run, true);
    assert.equal(gate({ ...prEnv('alpha'), BASE_REF: 'no-such-branch' }, { cwd: r.cwd }).run, true);
    assert.equal(gate({ ...prEnv('alpha'), BASE_REF: '' }, { cwd: r.cwd }).run, true);
    assert.equal(gate({ ...prEnv('alpha'), EVENT_NAME: 'push' }, { cwd: r.cwd }).run, true);
    r.change('turbo.json');
    assert.equal(gate(prEnv('alpha'), { cwd: r.cwd }).run, true);
  } finally { r.close(); }
});
test('CLI writes run and reason to GITHUB_OUTPUT and exits 0', () => {
  const r = repo(); try {
    r.change('apps/beta/index.js');
    const out = path.join(r.cwd, 'gh-output');
    writeFileSync(out, '');
    execFileSync(process.execPath, [path.resolve(import.meta.dirname, 'affected-gate.mjs')], { cwd: r.cwd, stdio: 'ignore', env: { ...process.env, ...prEnv('alpha'), GITHUB_OUTPUT: out } });
    assert.match(readFileSync(out, 'utf8'), /^run=false\nreason=alpha not affected\n$/u);
  } finally { r.close(); }
});
