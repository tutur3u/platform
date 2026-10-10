import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runIsolatedLifecycle } from './run-supabase-isolated.js';
import {
  assertConnectedMailTap,
  connectedMailAssertionCount,
  connectedMailFixture,
  connectedMailMigration,
  validateConnectedMailTrackedFiles,
} from './verify-connected-mail-accounts-contract.mjs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const tap = (count) =>
  [
    `1..${count}`,
    ...Array.from(
      { length: count },
      (_, i) => `ok ${i + 1} - assertion ${i + 1}`
    ),
  ].join('\n');

test('Connected Mail requires all ten strict assertions, not another fixture plan', () => {
  assert.equal(connectedMailAssertionCount, 10);
  assert.doesNotThrow(() => assertConnectedMailTap(tap(10)));
  for (const invalid of [
    tap(9),
    tap(11),
    tap(10).replace('ok 10', 'not ok 10'),
    tap(10).replace('ok 10 - assertion 10', ''),
    `${tap(10)}\n1..10`,
    `${tap(10)}\nBail out! incomplete`,
    tap(10).replace('assertion 10', 'assertion 10 # SKIP'),
    tap(10).replace('ok 10', 'ok 9'),
  ])
    assert.throws(() => assertConnectedMailTap(invalid));
});

test('fixture is tracked alongside its exact forward migration and complete config', () => {
  const fixture = `apps/database/supabase/tests/${connectedMailFixture}`;
  const files = [
    'apps/database/supabase/config.toml',
    connectedMailMigration,
    fixture,
  ];
  assert.deepEqual(validateConnectedMailTrackedFiles(files), [
    connectedMailFixture,
  ]);
  for (const missing of files)
    assert.throws(() =>
      validateConnectedMailTrackedFiles(files.filter((f) => f !== missing))
    );
  const sql = read(`../supabase/tests/${connectedMailFixture}`);
  assert.match(
    sql,
    /^begin;\ncreate extension if not exists pgtap with schema extensions;\nset local search_path=public,extensions;\nselect plan\(10\);/u
  );
  assert.match(sql, /select \* from finish\(\);\nrollback;\s*$/u);
  assert.match(sql, /select \* from finish\(\);/u);
  for (const table of [
    'mail_connected_accounts',
    'mail_oauth_requests',
    'mail_connected_sends',
  ])
    assert.match(sql, new RegExp(table, 'u'));
});

test('normal PR event executes enabled exact head with mandatory generated artifact', () => {
  const workflow = read(
    '../../../.github/workflows/connected-mail-accounts-contract.yaml'
  );
  const registry = read('../../../tuturuuu.ci.ts');
  assert.match(registry, /'connected-mail-accounts-contract\.yaml': true/u);
  assert.match(workflow, /pull_request:/u);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u
  );
  assert.match(workflow, /run: test "\$CONTRACT_ENABLED" = true/u);
  assert.match(
    workflow,
    /node apps\/database\/scripts\/verify-connected-mail-accounts-contract\.mjs/u
  );
  assert.match(
    workflow,
    /name: connected-mail-accounts-types-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u
  );
  assert.match(workflow, /path: packages\/types\/src\/supabase\.ts/u);
  assert.match(workflow, /if-no-files-found: error/u);
  for (const path of [
    'supabase/migrations/**',
    'supabase/tests/connected-mail-accounts.sql',
    'scripts/run-supabase*.js',
    'scripts/verify-connected-mail-accounts-contract.mjs',
  ])
    assert.equal(
      workflow
        .split('\n')
        .filter((line) => line.trim() === `- "apps/database/${path}"`).length,
      2
    );
});

test('verifier preserves complete tracked snapshot and approved lifecycle/typegen', () => {
  const runner = read('./verify-connected-mail-accounts-contract.mjs');
  const typegen = read('./run-supabase-isolated-typegen.js');
  assert.match(runner, /\['ls-files', '-z', 'apps\/database\/supabase'\]/u);
  assert.match(runner, /Isolated source snapshot mismatch/u);
  assert.match(
    runner,
    /metadata\.typegenOutput = 'packages\/types\/src\/supabase\.ts'/u
  );
  assert.match(runner, /assertConnectedMailTap\(tap\)/u);
  assert.match(runner, /'ON_ERROR_STOP=1'/u);
  assert.match(
    runner,
    /return runIsolatedLifecycle\(\{ binaryPath, metadata, runner \}\)/u
  );
  assert.match(typegen, /public,private,storage/u);
});

for (const failure of ['test', 'typegen', 'stop']) {
  test(`owned lifecycle propagates ${failure} failure and stops its own project`, async () => {
    const calls = [];
    const metadata = {
      disposableRoot: '/not-used-by-injected-runner',
      projectId: 'owned-connected-mail',
      testPath: 'supabase/tests/connected-mail-accounts.sql',
      typegenOutput: 'packages/types/src/supabase.ts',
    };
    const code = await runIsolatedLifecycle({
      binaryPath: 'not-invoked',
      metadata,
      registerSignals: () => () => {},
      updateMetadata: async () => {},
      removeRoot: async () => {
        calls.push('remove');
      },
      stderr: { write: () => {} },
      typegen: async () => {
        calls.push('typegen');
        if (failure === 'typegen')
          throw Object.assign(new Error('actual typegen failed'), {
            exitCode: 7,
          });
      },
      runner: async (_binary, args) => {
        calls.push(args);
        return { code: args.includes(failure) ? 7 : 0 };
      },
    });
    assert.equal(code, 7);
    const stop = calls.find(
      (call) => Array.isArray(call) && call.includes('stop')
    );
    assert.deepEqual(stop, [
      '--workdir',
      metadata.disposableRoot,
      'stop',
      '--project-id',
      metadata.projectId,
      '--no-backup',
    ]);
    if (failure === 'test') assert.equal(calls.includes('typegen'), false);
    if (failure === 'stop') assert.equal(calls.includes('remove'), false);
  });
}
