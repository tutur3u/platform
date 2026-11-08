import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
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

function concurrencyPolicy(workflow) {
  const group = workflow.match(/^ {2}group: (.+)$/mu)?.[1];
  const cancel = workflow.match(/^ {2}cancel-in-progress: (.+)$/mu)?.[1];
  assert.ok(group && cancel, 'workflow concurrency must be explicit');
  assert.doesNotMatch(workflow, /^ {2}queue: max$/mu);
  return (overrides = {}) => {
    const github = {
      workflow: 'Topic Delivery Foundation Contract',
      event_name: 'push',
      ref: 'refs/heads/main',
      sha: 'first-sha',
      run_id: 1,
      run_attempt: 1,
      event: ['pull_request', 'pull_request_target'].includes(
        overrides.event_name
      )
        ? { pull_request: { number: 99 } }
        : { pull_request: {} },
      ...overrides,
    };
    const evaluate = (code) =>
      runInNewContext(
        code.replace(
          /github\.event\.pull_request\.labels\.\*\.name/gu,
          '(github.event.pull_request.labels ?? []).map(label => label.name)'
        ),
        {
          github,
          contains: (values, search) =>
            values.some(
              (value) => String(value).toLowerCase() === search.toLowerCase()
            ),
          startsWith: (value, prefix) => value.startsWith(prefix),
          format: (template, ...values) =>
            template.replace(/\{([0-9]+)\}/gu, (_, index) => values[index]),
        },
        { timeout: 100 }
      );
    return {
      group: group.replace(/\$\{\{(.*?)\}\}/gu, (_, code) => evaluate(code)),
      cancel: evaluate(cancel.replace(/^\$\{\{|\}\}$/gu, '')),
    };
  };
}

function assertValidationConcurrency(policy) {
  for (const event_name of ['push', 'pull_request', 'pull_request_target']) {
    const first = {
      event_name,
      ref:
        event_name === 'pull_request'
          ? 'refs/pull/99/merge'
          : 'refs/heads/main',
    };
    const initial = policy(first);
    assert.equal(initial.cancel, true, `${event_name} supersedes validation`);
    assert.ok(initial.group);
    assert.deepEqual(
      policy({ ...first, sha: 'next-sha', run_id: 2 }),
      initial,
      `${event_name} shares its group across commits and runs`
    );
    assert.notEqual(
      policy({
        ...first,
        event: { pull_request: { number: 100 } },
        ref: event_name === 'push' ? 'refs/heads/other' : first.ref,
      }).group,
      initial.group,
      'distinct PRs or branches cannot cancel one another'
    );
    const rerun = policy({ ...first, run_attempt: 2 });
    assert.equal(rerun.cancel, false);
    assert.notEqual(rerun.group, initial.group);
    assert.notEqual(rerun.group, policy({ ...first, run_attempt: 3 }).group);
    assert.notEqual(
      rerun.group,
      policy({ ...first, run_attempt: 2, run_id: 2 }).group
    );
    assert.notEqual(
      rerun.group,
      policy({ ...first, run_attempt: 2, sha: 'next-sha' }).group
    );
  }
  for (const ref of [
    'refs/heads/production',
    'refs/heads/release-please--branches--production--release-notes',
    'refs/heads/release-please--branches--main',
  ]) {
    const initial = policy({ ref });
    assert.equal(initial.cancel, false, `${ref} preserves protected evidence`);
    assert.notEqual(initial.group, policy().group);
    for (const extra of [
      { sha: 'next-sha' },
      { run_id: 2 },
      { run_attempt: 2 },
    ]) {
      const next = policy({ ref, ...extra });
      assert.equal(next.cancel, false);
      assert.notEqual(
        next.group,
        initial.group,
        `${ref} isolates ${Object.keys(extra)}`
      );
    }
    assert.equal(
      policy({ ref, event_name: 'pull_request_target' }).cancel,
      true
    );
  }
  for (const ref of ['refs/heads/main', 'refs/heads/production']) {
    const dispatch = { ref, event_name: 'workflow_dispatch' };
    const initial = policy(dispatch);
    assert.equal(initial.cancel, false);
    assert.notEqual(initial.group, policy({ ref }).group);
    for (const extra of [
      { sha: 'next-sha' },
      { run_id: 2 },
      { run_attempt: 2 },
    ]) {
      const next = policy({ ...dispatch, ...extra });
      assert.equal(next.cancel, false);
      assert.notEqual(
        next.group,
        initial.group,
        `dispatch isolates ${Object.keys(extra)}`
      );
    }
  }
}

test('validation supersedes main/PR runs while protected pushes and qualification remain isolated', () => {
  const workflow = read(
    '../../../.github/workflows/topic-delivery-foundation-contract.yaml'
  );
  assertValidationConcurrency(concurrencyPolicy(workflow));
});

test('PR label admission separates concurrency groups without changing cancellation', () => {
  const policy = concurrencyPolicy(
    read('../../../.github/workflows/topic-delivery-foundation-contract.yaml')
  );
  const pr = (labels) =>
    policy({
      event_name: 'pull_request',
      ref: 'refs/pull/99/merge',
      event: { pull_request: { number: 99, labels } },
    });
  const admitted = pr([{ name: 'bug' }, { name: 'ready-for-ci' }]);
  assert.equal(admitted.cancel, true);
  assert.ok(admitted.group.endsWith('-latest'));
  for (const labels of [
    [],
    [{ name: 'bug' }],
    [{ name: 'not-ready-for-ci' }],
  ]) {
    const unadmitted = pr(labels);
    assert.equal(unadmitted.cancel, true);
    assert.equal(unadmitted.group, `${admitted.group}-unadmitted`);
  }
  assert.deepEqual(pr([{ name: 'READY-FOR-CI' }]), admitted);
});

test('concurrency controls reject the old main policy and missing isolation or cancellation guards', () => {
  const workflow = read(
    '../../../.github/workflows/topic-delivery-foundation-contract.yaml'
  );
  for (const unsafe of [
    workflow.replace(
      "github.ref == 'refs/heads/production'",
      "github.ref == 'refs/heads/main' || github.ref == 'refs/heads/production'"
    ),
    workflow.replace(
      /^ {2}cancel-in-progress: .+$/mu,
      '  cancel-in-progress: false'
    ),
    workflow.replace(
      /^ {2}cancel-in-progress: .+$/mu,
      '  cancel-in-progress: true'
    ),
    workflow.replace(
      'github.sha, github.run_id, github.run_attempt',
      'github.sha, github.run_id, 1'
    ),
    workflow.replace(
      'github.sha, github.run_id, github.run_attempt',
      "'shared-sha', github.run_id, github.run_attempt"
    ),
    workflow.replace(
      'github.sha, github.run_id, github.run_attempt',
      'github.sha, 1, github.run_attempt'
    ),
  ]) {
    assert.notEqual(
      unsafe,
      workflow,
      'negative control must change the workflow'
    );
    assert.throws(() => assertValidationConcurrency(concurrencyPolicy(unsafe)));
  }
});

test('workflow preserves PR and push fixture dependencies', () => {
  const workflow = read(
    '../../../.github/workflows/topic-delivery-foundation-contract.yaml'
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
