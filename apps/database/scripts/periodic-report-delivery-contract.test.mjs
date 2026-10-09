import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  periodicRaceScripts,
  withFixtureCleanup,
} from './periodic-report-delivery-concurrency.mjs';

const require = createRequire(import.meta.url);
const {
  readWorkflow,
} = require('../../../scripts/ci/workflow-yaml-test-helper.js');
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const race = read('./periodic-report-delivery-concurrency.mjs');
const runner = read('./verify-periodic-report-delivery-contract.mjs');

test('real contender scripts preserve bounded command and observed lock wait ordering', () => {
  const scripts = periodicRaceScripts('select 1;', 'select 2;');
  assert.ok(scripts.holder.includes("statement_timeout='5s'"));
  assert.ok(scripts.holder.endsWith('select 1;\n\\echo FIXTURE_READY\n'));
  assert.ok(scripts.competitor.includes('\n\\echo FIXTURE_READY\nselect 2;'));
  assert.match(scripts.release, /wait_event_type='Lock'/u);
  assert.match(scripts.release, /interval '3 seconds'/u);
  assert.match(scripts.release, /end \$wait\$; commit;/u);
});
test('race admits exact owned metadata and retains cleanup and real RPC outcomes', () => {
  for (const field of ['projectId', 'headSha', 'repositoryRoot'])
    assert.ok(race.includes(`admitted.${field}`));
  assert.ok(race.includes("admitted.status, 'testing'"));
  for (const assertion of [
    "execute(claim('skipped-worker')), '0'",
    "execute(claim('duplicate-worker')), '0'",
    'snapshot.queue.attempt_count, 1',
    'assert.match(revoked, /^409$/mu)',
    'assert.match(stale, /^f$/mu)',
    'assert.deepEqual(state(), completed)',
  ])
    assert.ok(race.includes(assertion), assertion);
  assert.match(
    race,
    /delete from public\.workspaces where creator_id='\$\{actor\}'/u
  );
  assert.match(race, /finally[\s\S]*Promise\.allSettled/u);
});
test('runner retains all historical fixtures and runs race before actual type generation', () => {
  for (const fixture of [
    'periodic-report-approval-delivery.sql',
    'periodic-report-stages.sql',
    'periodic-report-provider-outcomes.sql',
  ])
    assert.ok(runner.includes(fixture));
  assert.match(runner, /assertStrictTap\(tap\)/u);
  assert.match(
    runner,
    /await runPeriodicReportDeliveryConcurrency\(metadata\);\s*return \{ code: 0 \}/u
  );
  assert.ok(
    runner.includes("metadata.typegenOutput = 'packages/types/src/supabase.ts'")
  );
});
test('workflow tracks helper dependencies on PR/push and strict generated types after full runner', () => {
  const workflow = readWorkflow('periodic-report-delivery-contract.yaml');
  assert.deepEqual(workflow.on.push.branches, ['main', 'production']);
  for (const event of ['pull_request', 'push']) {
    for (const path of [
      'apps/database/scripts/periodic-report-delivery-*.mjs',
      'apps/database/scripts/periodic-report-delivery-types.ts',
      'apps/database/scripts/time-tracker-control-concurrency.mjs',
    ])
      assert.ok(workflow.on[event].paths.includes(path), `${event}:${path}`);
  }
  const steps = workflow.jobs.contract.steps;
  const strict = steps.findIndex(
    (step) =>
      step.name === 'Strictly check actual generated periodic delivery types'
  );
  assert.ok(
    strict >
      steps.findIndex(
        (step) =>
          step.name ===
          'Apply complete schema, run strict pgTAP, generate actual schema types'
      )
  );
  assert.match(
    steps[strict].run,
    /--ignoreConfig --noEmit --strict --skipLibCheck/u
  );
  assert.ok(
    steps.some((step) =>
      step.run?.includes('periodic-report-delivery-contract.test.mjs')
    )
  );
});

test('cleanup preserves the original failure and surfaces independent teardown failure', async () => {
  const primary = new Error('synthetic assertion');
  const cleanup = new Error('synthetic cleanup');
  await assert.rejects(
    withFixtureCleanup(
      async () => {
        throw primary;
      },
      async () => {
        throw cleanup;
      }
    ),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === primary &&
      error.errors[1] === cleanup
  );
  await assert.rejects(
    withFixtureCleanup(
      async () => {
        throw primary;
      },
      async () => {}
    ),
    (error) => error === primary
  );
  await assert.rejects(
    withFixtureCleanup(
      async () => {},
      async () => {
        throw cleanup;
      }
    ),
    (error) => error === cleanup
  );
});
test('teardown is attributable to the newly admitted synthetic actor and includes trigger-created members', () => {
  assert.ok(
    race.includes(
      'Synthetic actor must not preexist in admitted disposable database'
    )
  );
  assert.match(
    race,
    /delete from public\.workspace_members where user_id='\$\{actor\}'/u
  );
  assert.match(race, /delete from public\.users where id='\$\{actor\}'/u);
  const trigger = read(
    '../supabase/migrations/20260504102000_guard_personal_workspace_member_insert.sql'
  );
  assert.match(trigger, /values \('PERSONAL', true, new\.id\)/u);
  assert.match(trigger, /values \(new_ws_id, new\.id\)/u);
});

test('revocation compares the post-Retry counter and preserves actual attempt history', () => {
  const migration = read(
    '../supabase/migrations/20261007040000_periodic_report_unknown_outcomes.sql'
  );
  assert.match(
    migration,
    /on conflict \(report_id\) do update[\s\S]*?attempt_count = 0/u
  );
  assert.ok(race.includes('Explicit Retry resets the attempt counter'));
  assert.ok(race.includes('beforeRevocation.queue.attempt_count'));
  assert.ok(
    race.includes('snapshot.attempts,\n        beforeRevocation.attempts')
  );
  assert.match(race, /jsonb_agg\(to_jsonb\(a\) order by a\.id\)/u);
});
