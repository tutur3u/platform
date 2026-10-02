const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const {
  DEFAULT_MATRIX,
  parseTree,
  fingerprint,
  cacheContext,
  lookupTrustedCache,
  plan,
} = require('./e2e-result-plan');

const entries = parseTree(
  execFileSync('git', ['ls-tree', '-rz', '--full-tree', 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 32_000_000,
  })
);
const env = {
  E2E_ENABLED: 'true',
  EVENT_NAME: 'push',
  ImageVersion: '20261001.1',
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
  E2E_RESULT_CACHE_EPOCH: '1',
  GITHUB_REPOSITORY: 'owner/repo',
  GH_TOKEN: 'test-token',
};
const now = new Date('2026-10-02T12:00:00Z');
const context = cacheContext(env, now);
const suite = (id) => DEFAULT_MATRIX.find((item) => item.id === id);
const key = (tree, id) =>
  fingerprint(tree, id === 'inventory-storefront' ? id : suite(id), context);
function changed(file, overrides = {}) {
  let found = false;
  const result = entries.map((entry) => {
    if (entry.path !== file) return entry;
    found = true;
    return { ...entry, oid: 'f'.repeat(40), ...overrides };
  });
  if (!found)
    result.push({
      path: file,
      mode: '100644',
      type: 'blob',
      oid: 'f'.repeat(40),
      ...overrides,
    });
  return result;
}
const proof = { id: 42, ref: 'refs/heads/main', createdAt: now.toISOString() };

test('matrix preserves all four shards and six invitation job interfaces', () => {
  assert.equal(DEFAULT_MATRIX.length, 10);
  assert.deepEqual(
    DEFAULT_MATRIX.slice(0, 4).map((item) => item.shard),
    [1, 2, 3, 4]
  );
  for (const item of DEFAULT_MATRIX.slice(4))
    assert.equal(item.total_shards, 1);
});
test('dedicated spec changes rerun its suite and all redistributed general shards', () => {
  const tree = changed(
    'apps/web/e2e/workspace-invite-finance-access.noauth.spec.ts'
  );
  for (let id = 1; id <= 4; id++)
    assert.notEqual(key(tree, id), key(entries, id));
  assert.notEqual(
    key(tree, 'workspace-invite-finance'),
    key(entries, 'workspace-invite-finance')
  );
  assert.equal(
    key(tree, 'workspace-invite-mail'),
    key(entries, 'workspace-invite-mail')
  );
  assert.equal(
    key(tree, 'inventory-storefront'),
    key(entries, 'inventory-storefront')
  );
});
test('satellite runtime changes isolate owning dedicated suite and general jobs', () => {
  const tree = changed('apps/mail/src/new-runtime.ts');
  assert.notEqual(
    key(tree, 'workspace-invite-mail'),
    key(entries, 'workspace-invite-mail')
  );
  assert.notEqual(key(tree, 1), key(entries, 1));
  assert.equal(
    key(tree, 'workspace-invite-finance'),
    key(entries, 'workspace-invite-finance')
  );
  assert.equal(
    key(tree, 'inventory-storefront'),
    key(entries, 'inventory-storefront')
  );
});
test('inventory and storefront participate together without affecting unrelated invites', () => {
  for (const file of [
    'apps/inventory/src/new.ts',
    'apps/storefront/src/new.ts',
  ]) {
    const tree = changed(file);
    assert.notEqual(
      key(tree, 'inventory-storefront'),
      key(entries, 'inventory-storefront')
    );
    assert.equal(
      key(tree, 'workspace-invite-mail'),
      key(entries, 'workspace-invite-mail')
    );
  }
});
test('shared API, auth helpers, schema, package, toolchain and unknown runtime invalidate globally', () => {
  for (const file of [
    'apps/web/src/app/api/new/route.ts',
    'apps/web/src/app/new/page.mdx',
    'apps/web/e2e/helpers/auth.ts',
    'apps/web/e2e/global-setup.ts',
    'apps/database/supabase/migrations/new.sql',
    'packages/internal-api/src/new.ts',
    'bun.lock',
    'apps/web/playwright.config.ts',
    '.github/actions/new/action.yml',
    'scripts/new-runtime.js',
    'apps/new-app/src/new.ts',
  ]) {
    const tree = changed(file);
    for (const id of [1, 'workspace-invite-mail', 'inventory-storefront'])
      assert.notEqual(key(tree, id), key(entries, id), `${file}: ${id}`);
  }
});
test('mode, deletion, rename and additions all affect content identity', () => {
  const file = 'apps/web/e2e/helpers/auth.ts';
  for (const tree of [
    changed(file, { mode: '100755' }),
    entries.filter((entry) => entry.path !== file),
    entries.map((entry) =>
      entry.path === file ? { ...entry, path: `${file}.renamed` } : entry
    ),
    changed('apps/web/e2e/helpers/new.ts'),
  ])
    assert.notEqual(key(tree, 1), key(entries, 1));
  assert.equal(key([...entries].reverse(), 1), key(entries, 1));
});
test('docs and explicitly paused app changes do not invalidate live E2E', () => {
  for (const file of [
    'apps/docs/new.mdx',
    'apps/mobile/lib/new.dart',
    'apps/backend/src/new.rs',
    'apps/tanstack-web/src/new.ts',
    'README.md',
  ])
    assert.equal(key(changed(file), 1), key(entries, 1));
});
test('day, runner image, platform, architecture and operator epoch invalidate keys', () => {
  for (const field of [
    'ImageVersion',
    'RUNNER_OS',
    'RUNNER_ARCH',
    'E2E_RESULT_CACHE_EPOCH',
  ]) {
    const other = cacheContext({ ...env, [field]: 'new' }, now);
    assert.notEqual(fingerprint(entries, suite(1), other), key(entries, 1));
    assert.equal(cacheContext({ ...env, [field]: '' }, now), null);
  }
  const tomorrow = cacheContext(env, new Date('2026-10-03T00:00:00Z'));
  assert.notEqual(fingerprint(entries, suite(1), tomorrow), key(entries, 1));
});
test('all cached suites produce valid placeholder matrix and disable expensive jobs', async () => {
  const result = await plan({ entries, env, now, lookup: async () => proof });
  assert.equal(result.run_web, false);
  assert.equal(result.run_inventory, false);
  assert.equal(result.matrix.include.length, 1);
  assert.equal(result.matrix.include[0].cache_key, '');
  assert.equal(result.provenance.filter((item) => item.cache).length, 11);
});
test('partial cache hits run only missing suites', async () => {
  const missing = key(entries, 'workspace-invite-finance');
  const result = await plan({
    entries,
    env,
    now,
    lookup: async (input) => (input === missing ? null : proof),
  });
  assert.deepEqual(
    result.matrix.include.map((item) => item.id),
    ['workspace-invite-finance']
  );
  assert.equal(result.run_inventory, false);
});
test('manual runs always execute without consulting cache', async () => {
  const result = await plan({
    entries,
    env: { ...env, EVENT_NAME: 'workflow_dispatch' },
    now,
    lookup: async () => {
      throw new Error('must not query');
    },
  });
  assert.equal(result.matrix.include.length, 10);
  assert.equal(result.run_inventory, true);
});
test('disabled E2E produces valid skipped plan without consulting cache', async () => {
  const result = await plan({
    entries,
    env: { ...env, E2E_ENABLED: 'false' },
    now,
    lookup: async () => {
      throw new Error('must not query');
    },
  });
  assert.equal(result.run_web, false);
  assert.equal(result.run_inventory, false);
});
test('missing Git inputs, spec inventory, runner metadata or cache API run everything', async () => {
  for (const scenario of [
    { entries: null },
    { entries: [] },
    {
      entries: entries.filter(
        (entry) =>
          entry.path !== 'apps/web/e2e/workspace-invitations.noauth.spec.ts'
      ),
    },
    { env: { ...env, ImageVersion: '' } },
    {
      lookup: async () => {
        throw new Error('offline');
      },
    },
  ]) {
    const result = await plan({
      entries,
      env,
      now,
      lookup: async () => proof,
      ...scenario,
    });
    assert.equal(result.matrix.include.length, 10);
    assert.equal(result.run_inventory, true);
  }
});
test('trusted cache lookup rejects branch and prefix-only matches', async () => {
  const input = key(entries, 1);
  const cache = { id: 42, size_in_bytes: 512, created_at: now.toISOString() };
  const result = await lookupTrustedCache(input, env, async (url) => {
    assert.equal(new URL(url).searchParams.get('ref'), 'refs/heads/main');
    assert.equal(new URL(url).searchParams.get('key'), input);
    return {
      total_count: 2,
      actions_caches: [
        { ...cache, key: input, ref: 'refs/heads/feature/evil' },
        { ...cache, key: `${input}-suffix`, ref: 'refs/heads/main' },
      ],
    };
  });
  assert.equal(result, null);
});
test('exact main proof returns provenance and missing auth never queries', async () => {
  const input = key(entries, 1);
  const found = await lookupTrustedCache(input, env, async () => ({
    total_count: 1,
    actions_caches: [
      {
        id: 42,
        key: input,
        ref: 'refs/heads/main',
        size_in_bytes: 512,
        created_at: now.toISOString(),
      },
    ],
  }));
  assert.deepEqual(found, proof);
  assert.equal(
    await lookupTrustedCache(input, { ...env, GH_TOKEN: '' }, () =>
      assert.fail()
    ),
    null
  );
});
test('pagination reaches exact match and bounded/incomplete histories fail open', async () => {
  const input = key(entries, 1);
  let calls = 0;
  const found = await lookupTrustedCache(input, env, async () => {
    calls++;
    return calls === 1
      ? { total_count: 101, actions_caches: Array(100).fill({ key: 'other' }) }
      : {
          total_count: 101,
          actions_caches: [
            {
              id: 42,
              key: input,
              ref: 'refs/heads/main',
              size_in_bytes: 512,
              created_at: now.toISOString(),
            },
          ],
        };
  });
  assert.deepEqual(found, proof);
  assert.equal(calls, 2);
  await assert.rejects(
    lookupTrustedCache(input, env, async () => ({
      total_count: 101,
      actions_caches: [],
    }))
  );
  await assert.rejects(
    lookupTrustedCache(input, env, async () => ({
      total_count: 1000,
      actions_caches: Array(100).fill({ key: 'other' }),
    }))
  );
  await assert.rejects(
    lookupTrustedCache(input, env, async () => ({ actions_caches: [] }))
  );
});
test('Git tree parser rejects uncertain entries and preserves unusual file names', () => {
  assert.throws(() => parseTree('invalid\0'));
  const parsed = parseTree(
    `100644 blob ${'a'.repeat(40)}\tfile with\nnewline.ts\0`
  );
  assert.equal(parsed[0].path, 'file with\nnewline.ts');
});

test('lookup concurrency stays bounded and output ordering remains stable', async () => {
  let active = 0;
  let maxActive = 0;
  const result = await plan({
    entries,
    env,
    now,
    lookup: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return null;
    },
  });
  assert.equal(maxActive, 4);
  assert.deepEqual(
    result.matrix.include.map((item) => item.id),
    DEFAULT_MATRIX.map((item) => item.id)
  );
});
test('account-shape acceptance owns both Contacts and Finance runtimes', () => {
  for (const app of ['contacts', 'finance']) {
    const tree = changed(`apps/${app}/src/new-runtime.ts`);
    assert.notEqual(
      key(tree, 'invite-account-shapes'),
      key(entries, 'invite-account-shapes')
    );
  }
});
