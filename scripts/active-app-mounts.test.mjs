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
  readCommittedConfig,
  readRedirectConfig,
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

test('commits the Tasks mount with its subtree and service binding', () => {
  const committed = readCommittedConfig();
  const paths = committed.vars.GATEWAY_MOUNTED_PATHS.split(',');
  assert.ok(paths.includes('/tasks') && paths.includes('/tasks/*'));
  assert.ok(
    committed.services.some(
      (entry) =>
        entry.binding === 'MOUNT_TASKS' && entry.service === 'tuturuuu-tasks'
    )
  );
});

test('lists the Tasks mount only after activation', () => {
  assert.deepEqual(
    resolveActiveMounts(
      committedMountBases(config('/admin,/admin/*,/tasks,/tasks/*')),
      registry,
      true
    ),
    ['infra', 'tasks']
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

test('keeps gateway and legacy redirect routing at the baseline while off', () => {
  const gateway = readCommittedConfig(false);
  const redirect = readRedirectConfig(false);
  assert.equal(
    gateway.vars.GATEWAY_MOUNTED_PATHS,
    '/learn,/nova,/nova/*,/roadmap,/tools,/tools/*,/teach,/teach/*,/lms,/lms/*,/admin,/admin/*,/meet,/meet/*,/mail,/mail/*,/contacts,/contacts/*,/calendar,/calendar/*,/apps,/apps/*,/finance,/finance/*,/tasks,/tasks/*'
  );
  assert.equal(
    redirect.vars.SUBDOMAIN_REDIRECT_APPS,
    'apps,mail,calendar,meet,tasks,finance'
  );
  assert.deepEqual(
    resolveActiveMounts(committedMountBases(gateway), registry, false),
    [
      'calendar',
      'contacts',
      'finance',
      'infra',
      'learn',
      'mail',
      'meet',
      'nova',
      'teach',
    ]
  );
});

test('every candidate legacy redirect has a binding to its mounted Worker', () => {
  const gateway = readCommittedConfig(true);
  const redirect = readRedirectConfig(true);
  const bases = new Set(committedMountBases(gateway));
  const aliasApps = new Map([
    ['admin', 'infra'],
    ['infrastructure', 'infra'],
    ['store', 'storefront'],
    ['stores', 'storefront'],
    ['storefronts', 'storefront'],
  ]);
  for (const host of redirect.vars.SUBDOMAIN_REDIRECT_APPS.split(',')) {
    const base = registry.getAppBasePath(aliasApps.get(host) ?? host);
    assert.ok(bases.has(base), `Missing gateway mount for ${host}`);
    const upstream = gateway.services.find(
      (entry) => entry.binding === `MOUNT_${base.slice(1).toUpperCase()}`
    );
    const legacy = redirect.services.find(
      (entry) => entry.binding === `APP_${host.toUpperCase()}`
    );
    assert.ok(upstream && legacy, `Missing service binding for ${host}`);
    assert.equal(legacy.service, upstream.service);
  }
});
