import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deliveryFoundationRaceScripts } from './topic-delivery-foundation-concurrency.mjs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('unique-owner fixture holds the actual insertion until explicit release', () => {
  const scripts = deliveryFoundationRaceScripts('unique');
  assert.match(
    scripts.holder,
    /^begin; set local statement_timeout='5s'; insert into private\.topic_announcement_delivery_attempts/u
  );
  assert.match(scripts.holder, /\n\\echo FIXTURE_READY\n$/u);
  assert.doesNotMatch(scripts.holder, /commit;|rollback;/u);
  assert.match(scripts.contender, /^\\set VERBOSITY verbose\n/u);
  assert.match(
    scripts.contender,
    /\n\\echo FIXTURE_READY\ninsert into private\.topic_announcement_delivery_attempts/u
  );
  assert.equal(scripts.expectedError, '23505');
  assert.notEqual(
    scripts.holder.match(/values\('([^']+)'/u)[1],
    scripts.contender.match(/values\('([^']+)'/u)[1]
  );
});

test('snapshot contention uses a real row lock and mutation rather than mocked outcomes', () => {
  const scripts = deliveryFoundationRaceScripts('immutable');
  assert.match(
    scripts.holder,
    /select id from private\.topic_announcement_delivery_attempts .* for update;/u
  );
  assert.match(
    scripts.contender,
    /update private\.topic_announcement_delivery_attempts set snapshot=/u
  );
  assert.equal(scripts.expectedError, '55000');
});

test('exact-head gate executes complete schema, strict TAP, real contention and actual type generation', () => {
  const workflow = read(
    '../../../.github/workflows/topic-delivery-foundation-contract.yaml'
  );
  const runner = read('./verify-topic-delivery-foundation.mjs');
  const config = read('../../../tuturuuu.ci.ts');
  assert.match(config, /'topic-delivery-foundation-contract\.yaml': true/u);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u
  );
  assert.match(workflow, /run: test "\$CONTRACT_ENABLED" = true/u);
  assert.match(
    workflow,
    /node apps\/database\/scripts\/verify-topic-delivery-foundation\.mjs/u
  );
  assert.match(workflow, /if-no-files-found: error/u);
  assert.match(
    runner,
    /const fixtures = \['topic-delivery-foundation\.sql'\]/u
  );
  assert.match(runner, /assertStrictTap\(tap\)/u);
  assert.match(
    runner,
    /await runTopicDeliveryFoundationConcurrency\(metadata\)/u
  );
  assert.match(
    runner,
    /metadata\.typegenOutput = 'packages\/types\/src\/supabase\.ts'/u
  );
  assert.match(
    runner,
    /runIsolatedLifecycle\(\{ binaryPath, metadata, runner \}\)/u
  );
  assert.match(runner, /'ON_ERROR_STOP=1'/u);
});

test('protected refs preserve unique validation identities and fixture dependencies', () => {
  const workflow = read(
    '../../../.github/workflows/topic-delivery-foundation-contract.yaml'
  );
  assert.match(
    workflow,
    /format\('\{0\}-\{1\}-\{2\}', github\.sha, github\.event_name, github\.run_id\)/u
  );
  assert.match(
    workflow,
    /cancel-in-progress:.*github\.ref != 'refs\/heads\/main'.*github\.ref != 'refs\/heads\/production'/u
  );
  for (const path of [
    'supabase/migrations/**',
    'supabase/tests/topic-delivery-foundation.sql',
    'scripts/time-tracker-control-concurrency.mjs',
    'scripts/topic-delivery-foundation-concurrency.mjs',
    'scripts/run-supabase*.js',
  ]) {
    assert.equal(
      workflow.split(`apps/database/${path}`).length - 1,
      2,
      `PR and push include ${path}`
    );
  }
});
