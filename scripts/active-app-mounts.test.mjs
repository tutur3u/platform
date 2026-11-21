import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  committedMountBases,
  missingLivePaths,
  parseJsonc,
  resolveActiveMounts,
} from './active-app-mounts.mjs';

const SCRIPT = fileURLToPath(
  new URL('./active-app-mounts.mjs', import.meta.url)
);
const registry = await import('../packages/utils/src/app-mounts.ts');
const config = (paths) => ({ vars: { GATEWAY_MOUNTED_PATHS: paths } });

test('parses the committed JSONC inventory', () => {
  assert.deepEqual(
    parseJsonc('{ // note\n "a": "x//y", /* b */ "c": [1,], }'),
    { a: 'x//y', c: [1] }
  );
});

test('resolves bases and aliases to registered app names', () => {
  const bases = committedMountBases(
    config('/admin,/admin/*,/lms/learn,/meet,/meet/*,/roadmap,/lms,/lms/*')
  );
  assert.deepEqual(bases, [
    '/admin',
    '/lms/learn',
    '/meet',
    '/roadmap',
    '/lms',
  ]);
  assert.deepEqual(resolveActiveMounts(bases, registry), [
    'infra',
    'learn',
    'meet',
  ]);
});

test('never lists a mount without a verify-token route', () => {
  assert.deepEqual(
    resolveActiveMounts(
      ['/admin', '/tools', '/roadmap', '/lms', '/apps'],
      registry
    ),
    ['infra']
  );
});

test('fails closed on an unregistered mount or an empty list', () => {
  assert.throws(
    () => resolveActiveMounts(['/admin', '/unknown'], registry),
    /\/unknown/u
  );
  assert.throws(
    () => resolveActiveMounts(['/roadmap'], registry),
    /No committed/u
  );
  assert.throws(() => resolveActiveMounts([], registry), /No committed/u);
});

test('reports committed paths that are not live', () => {
  const live = {
    result: {
      bindings: [
        { name: 'GATEWAY_MOUNTED_PATHS', text: '/admin,/admin/*,/mail' },
      ],
    },
  };
  assert.deepEqual(
    missingLivePaths(config('/admin,/admin/*,/mail,/mail/*'), live),
    ['/mail/*']
  );
});

test('the committed inventory resolves, and the CLI checks it against live', () => {
  const out = execFileSync('node', [SCRIPT], { encoding: 'utf8' }).trim();
  assert.match(out, /^[a-z]+(,[a-z]+)*$/u);
  assert.ok(out.split(',').includes('infra'));

  const dir = mkdtempSync(join(tmpdir(), 'active-mounts-'));
  const stale = join(dir, 'version.json');
  writeFileSync(
    stale,
    JSON.stringify({ bindings: [{ name: 'GATEWAY_MOUNTED_PATHS', text: '' }] })
  );
  assert.throws(
    () => execFileSync('node', [SCRIPT, '--live', stale], { stdio: 'pipe' }),
    /not live/u
  );
});
