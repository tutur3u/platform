import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createStorageRaceExecutor,
  parseStorageRaceScalar,
  storageAnalyticsRaceScripts,
  storageRaceWorkspace,
} from './external-project-storage-analytics-concurrency.mjs';
import { runIsolatedLifecycle } from './run-supabase-isolated.js';
import {
  assertStorageAnalyticsTap,
  storageAnalyticsAssertionCount,
  storageAnalyticsFixture,
  storageAnalyticsMigration,
  storageAnalyticsMigrationSuffix,
  validateStorageAnalyticsTrackedFiles,
} from './verify-external-project-storage-analytics-contract.mjs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const tap = (n) =>
  [
    `1..${n}`,
    ...Array.from({ length: n }, (_, i) => `ok ${i + 1} - assertion ${i + 1}`),
  ].join('\n');
test('all fifteen SQL assertions must complete without missing, duplicate, failed or skipped outcomes', () => {
  assert.equal(storageAnalyticsAssertionCount, 15);
  assert.doesNotThrow(() => assertStorageAnalyticsTap(tap(15)));
  for (const invalid of [
    tap(14),
    tap(16),
    tap(15).replace('ok 15', 'not ok 15'),
    tap(15).replace('ok 15 - assertion 15', ''),
    tap(15).replace('assertion 15', 'assertion 15 # SKIP'),
    tap(15).replace('ok 15', 'ok 14'),
    `${tap(15)}\nBail out! incomplete`,
  ])
    assert.throws(() => assertStorageAnalyticsTap(invalid));
});
test('the tracked schema requires config, exact fixture and one forward migration, not old or duplicate migration', () => {
  const config = 'apps/database/supabase/config.toml';
  const fixture = `apps/database/supabase/tests/${storageAnalyticsFixture}`;
  const migration = storageAnalyticsMigration;
  assert.ok(migration.endsWith(storageAnalyticsMigrationSuffix));
  const files = [config, fixture, migration];
  assert.deepEqual(validateStorageAnalyticsTrackedFiles(files), [
    storageAnalyticsFixture,
  ]);
  for (const missing of files)
    assert.throws(() =>
      validateStorageAnalyticsTrackedFiles(files.filter((f) => f !== missing))
    );
  assert.throws(() =>
    validateStorageAnalyticsTrackedFiles([
      config,
      fixture,
      migration,
      migration.replace('20261011002103', '20261011002104'),
    ])
  );
  assert.throws(() =>
    validateStorageAnalyticsTrackedFiles([
      config,
      fixture,
      migration.replace('20261011002103', '20261008010000'),
    ])
  );
  const sql = read(`../supabase/tests/${storageAnalyticsFixture}`);
  assert.match(sql, /SELECT plan\(15\);/u);
  assert.match(sql, /SELECT \* FROM finish\(\);/u);
  assert.match(sql, /get_external_project_storage_analytics/u);
});
test('normal PR updates select enabled exact-head gate and require actual schema artifact', () => {
  const w = read(
    '../../../.github/workflows/external-project-storage-analytics-contract.yaml'
  );
  assert.match(
    read('../../../tuturuuu.ci.ts'),
    /'external-project-storage-analytics-contract\.yaml': true/u
  );
  assert.match(w, /pull_request:/u);
  assert.match(w, /ref:.*github.event.pull_request.head.sha.*github.sha/u);
  assert.match(w, /test "\$CONTRACT_ENABLED" = true/u);
  assert.match(w, /verify-external-project-storage-analytics-contract\.mjs/u);
  assert.match(w, /external-project-storage-analytics-types-.*github.sha/u);
  assert.match(w, /if-no-files-found: error/u);
});
test('verifier uses complete tracked snapshot, original body hash and canonical lifecycle/typegen', () => {
  const source = read(
    './verify-external-project-storage-analytics-contract.mjs'
  );
  assert.match(source, /\['ls-files', '-z', 'apps\/database\/supabase'\]/u);
  assert.match(source, /Isolated source snapshot mismatch/u);
  assert.match(source, /createHash\('sha256'\)/u);
  assert.match(
    source,
    /metadata.typegenOutput = 'packages\/types\/src\/supabase.ts'/u
  );
  assert.match(source, /assertStorageAnalyticsTap\(tap\)/u);
  assert.match(source, /'ON_ERROR_STOP=1'/u);
  assert.match(
    source,
    /return runIsolatedLifecycle\(\{ binaryPath, metadata, runner \}\)/u
  );
  assert.match(
    read('./run-supabase-isolated-typegen.js'),
    /public,private,storage/u
  );
});
for (const failure of ['test', 'typegen', 'stop']) {
  test(`owned lifecycle propagates ${failure} failure and stops only its own project`, async () => {
    const calls = [];
    const metadata = {
      disposableRoot: '/not-used-by-injected-runner',
      projectId: 'owned-storage-analytics',
      testPath: `supabase/tests/${storageAnalyticsFixture}`,
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
    assert.deepEqual(
      calls.find((c) => Array.isArray(c) && c.includes('stop')),
      [
        '--workdir',
        metadata.disposableRoot,
        'stop',
        '--project-id',
        metadata.projectId,
        '--no-backup',
      ]
    );
    if (failure === 'test') assert.equal(calls.includes('typegen'), false);
    if (failure === 'stop') assert.equal(calls.includes('remove'), false);
  });
}

test('real insert/update contender scripts preserve readiness, bounded sessions and observed workspace advisory blocking', () => {
  for (const operation of ['insert', 'update']) {
    const scripts = storageAnalyticsRaceScripts(operation);
    assert.ok(scripts.holder.startsWith('begin;'));
    assert.ok(
      scripts.holder.includes('get_external_project_storage_analytics')
    );
    assert.ok(scripts.holder.includes(storageRaceWorkspace));
    assert.ok(scripts.holder.endsWith('\n\\echo FIXTURE_READY\n'));
    assert.ok(scripts.competitor.startsWith('\\set VERBOSITY verbose\n'));
    assert.ok(scripts.competitor.includes('\n\\echo FIXTURE_READY\n'));
    assert.ok(
      scripts.competitor.includes(
        operation === 'insert'
          ? 'insert into storage.objects'
          : 'update storage.objects'
      )
    );
    for (const script of [scripts.holder, scripts.competitor]) {
      assert.ok(script.includes("statement_timeout='5s'"));
      assert.ok(script.includes("lock_timeout='4s'"));
      assert.ok(script.includes("idle_in_transaction_session_timeout='6s'"));
    }
    assert.ok(scripts.release.includes('pg_blocking_pids(a.pid)'));
    assert.ok(
      scripts.release.includes("l.locktype='advisory' and not l.granted")
    );
    assert.ok(
      scripts.release.includes(
        `hashtextextended('${storageRaceWorkspace}',73007)`
      )
    );
    assert.ok(scripts.release.includes("interval '3 seconds'"));
    assert.ok(scripts.release.endsWith('commit;'));
  }
  assert.throws(() => storageAnalyticsRaceScripts('delete-all'));
});
test('runtime verifier requires race after strict fixture and before canonical typegen lifecycle completes', () => {
  const verifier = read(
    './verify-external-project-storage-analytics-contract.mjs'
  );
  assert.ok(
    verifier.indexOf('assertStorageAnalyticsTap(tap)') <
      verifier.indexOf('await runStorageAnalyticsConcurrency(metadata)')
  );
  const race = read('./external-project-storage-analytics-concurrency.mjs');
  assert.match(race, /admitted.status, 'testing'/u);
  assert.match(race, /Race must begin with no cache row/u);
  assert.match(
    race,
    /Contending mutation invalidated the newly committed first cache row/u
  );
  assert.match(race, /Recalculation must include committed insertion\/update/u);
  assert.match(race, /new AggregateError/u);
});

test('actual executor emits quiet bounded psql invocation and parses only one integer row', () => {
  const calls = [];
  const executor = createStorageRaceExecutor(
    'owned-source-head',
    (command, args, options) => {
      calls.push({ command, args, options });
      return '150\n';
    }
  );
  assert.equal(executor.scalar('select 150;'), '150');
  const call = calls[0];
  assert.equal(call.command, 'docker');
  assert.deepEqual(call.args, [
    'exec',
    '-i',
    'supabase_db_owned-source-head',
    'psql',
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '--dbname',
    'postgres',
  ]);
  assert.ok(
    call.options.input.startsWith(
      "set statement_timeout='5s'; set lock_timeout='4s'; set idle_in_transaction_session_timeout='6s';"
    )
  );
  assert.ok(call.options.input.endsWith('select 150;'));
  assert.equal(call.options.timeout, 10000);
  assert.equal(call.options.maxBuffer, 65536);
  assert.throws(() => createStorageRaceExecutor('foreign/identity'));
  for (const output of [
    'SET\n150\n',
    '150\n151\n',
    '',
    '150 rows',
    '{"role":"service_role"}\n150',
    'ERROR: query failed',
  ])
    assert.throws(() => parseStorageRaceScalar(output));
  assert.equal(parseStorageRaceScalar('0\n'), '0');
  assert.equal(parseStorageRaceScalar('1\n'), '1');
  const contaminated = createStorageRaceExecutor(
    'owned-source-head',
    () => 'SET\n150\n'
  );
  assert.throws(() => contaminated.scalar('select 150;'));
});
