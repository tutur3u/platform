const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const {
  evaluateIf,
  repository,
  repositoryId,
  headSha,
  runGate,
  runningJobs,
  triggerStep,
} = require('./workflow-run-trust-test-helper');
const workflow = readWorkflow('supabase-staging.yaml');
const migrate = workflow.jobs.migrate;
const step = triggerStep(migrate);
function push(overrides = {}, event = {}) {
  return {
    event_name: 'push',
    ref: 'refs/heads/main',
    ref_protected: true,
    repository,
    repository_id: String(repositoryId),
    sha: headSha,
    event: {
      ref: 'refs/heads/main',
      after: headSha,
      deleted: false,
      repository: { full_name: repository, id: repositoryId },
      ...event,
    },
    ...overrides,
  };
}
function dispatch(ref = 'refs/heads/main') {
  return push({ event_name: 'workflow_dispatch', ref });
}
const group = (github) =>
  evaluateIf(
    `(${workflow.concurrency.group.replace(/^\$\{\{|\}\}$/gu, '')}) == 'supabase-staging-migration'`,
    { run_id: 9, ...github }
  );
function proof(github, compareDefault = 'identical', targetStep = step) {
  return runGate(targetStep, github, { compareDefault });
}

test('staging uses protected main push and main-only dispatch without a preview dependency', () => {
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.equal(workflow.on.workflow_run, undefined);
  assert.equal(migrate.steps[0], step);
  assert.equal(migrate.environment, 'supabase-staging-migrations');
  assert.doesNotMatch(step.run, /\$\{\{/u);
  assert.doesNotMatch(JSON.stringify(step.env), /secrets\.|github\.event/u);
  for (const github of [push(), dispatch()]) {
    assert.deepEqual(
      runningJobs(workflow, github, {
        gate: 'run',
        compareDefault: 'identical',
      }),
      ['migrate']
    );
    assert.equal(group(github), true);
  }
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.concurrency.queue, 'max');
});

test('real staging shell binds push commit and retains behind-main ancestry', () => {
  for (const status of ['identical', 'behind']) {
    const result = proof(push(), status);
    assert.equal(result.ok, true, result.stdout + result.stderr);
    assert.deepEqual(result.outputs, {
      trusted: 'true',
      head_sha: headSha,
      branch: 'main',
    });
  }
  for (const status of ['ahead', 'diverged']) {
    const result = proof(push(), status);
    assert.equal(result.ok, false);
    assert.deepEqual(result.outputs, {});
  }
});

const negatives = [
  ['runner branch', () => push({ ref: 'refs/heads/feature/x' })],
  ['runner case', () => push({ ref: 'refs/heads/Main' })],
  ['tag ref', () => push({ ref: 'refs/tags/main' }, { ref: 'refs/tags/main' })],
  ['event ref', () => push({}, { ref: 'refs/heads/feature/x' })],
  ['event ref case', () => push({}, { ref: 'refs/heads/Main' })],
  ['event after', () => push({}, { after: 'b'.repeat(40) })],
  [
    'event after case',
    () => push({ sha: 'a'.repeat(40) }, { after: 'A'.repeat(40) }),
  ],
  [
    'repository name',
    () =>
      push(
        {},
        { repository: { full_name: 'attacker/platform', id: repositoryId } }
      ),
  ],
  [
    'repository name case',
    () =>
      push(
        {},
        {
          repository: { full_name: repository.toUpperCase(), id: repositoryId },
        }
      ),
  ],
  [
    'repository id',
    () => push({}, { repository: { full_name: repository, id: 1 } }),
  ],
  ['missing repository', () => push({}, { repository: null })],
  ['deleted push', () => push({}, { deleted: true })],
  ['missing deleted flag', () => push({}, { deleted: undefined })],
  ['string deleted flag', () => push({}, { deleted: 'false' })],
  ['unprotected ref', () => push({ ref_protected: false })],
  ['short SHA', () => push({ sha: 'abc' }, { after: 'abc' })],
  ['unsupported event', () => push({ event_name: 'pull_request' })],
  [
    'name-spoofed completion',
    () =>
      push(
        { event_name: 'workflow_run' },
        {
          workflow_run: {
            name: 'Vercel Platform Preview Deployment',
            head_branch: 'main',
            event: 'push',
            conclusion: 'success',
          },
        }
      ),
  ],
];
for (const [name, context] of negatives)
  test(`staging real shell rejects ${name} before checkout`, () => {
    const result = proof(context());
    assert.equal(result.ok, false, result.stdout + result.stderr);
    assert.deepEqual(result.outputs, {});
  });

test('staging dispatch is main-only and uses its exact runner SHA', () => {
  assert.equal(proof(dispatch()).ok, true);
  for (const ref of [
    'refs/heads/Main',
    'refs/tags/main',
    'refs/heads/feature/x',
  ]) {
    assert.equal(proof(dispatch(ref)).ok, false);
    assert.equal(group(dispatch(ref)), ref === 'refs/heads/Main');
  }
  assert.equal(proof({ ...dispatch(), sha: 'not-a-sha' }).ok, false);
});

test('staging admission and lock reject invalid automatic triggers', () => {
  for (const context of [
    push({ ref_protected: false }),
    push({}, { after: 'b'.repeat(40) }),
    push({}, { deleted: true }),
    push(
      {},
      { repository: { full_name: 'attacker/platform', id: repositoryId } }
    ),
    push({ event_name: 'workflow_run' }),
  ]) {
    assert.deepEqual(runningJobs(workflow, context), []);
    assert.equal(group(context), false);
  }
});

test('staging push proof mutation controls exercise SHA and repository binding', () => {
  for (const [line, context] of [
    [
      '              [ "$(field .after)" = "$GITHUB_SHA" ] || reject "push after does not match runner SHA"\n',
      push({}, { after: 'b'.repeat(40) }),
    ],
    [
      '            [ "$(field .repository.id)" = "$GITHUB_REPOSITORY_ID" ] ||\n',
      push({}, { repository: { full_name: repository, id: 1 } }),
    ],
  ]) {
    let weakened = step.run.replace(line.trimStart(), '');
    // YAML parsing removes the common indentation from every shell line.
    if (line.includes('.repository.id'))
      weakened = step.run.replace(
        '  [ "$(field .repository.id)" = "$GITHUB_REPOSITORY_ID" ] ||',
        '  true ||'
      );
    assert.notEqual(weakened, step.run);
    assert.equal(proof(context).ok, false);
    assert.equal(
      proof(context, 'identical', { ...step, run: weakened }).ok,
      true
    );
  }
});

test('staging preserves verified checkout, secret scope, project binding and marker payload', () => {
  assert.equal(migrate.env?.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(migrate.env?.TARGET_SHA, undefined);
  const marker = migrate.steps.find(
    (s) => s.name === 'Record successful staging migration marker'
  );
  assert.match(
    marker.env.DEPLOYMENT_MARKER_SHA,
    /^\$\{\{ steps\.trigger\.outputs\.head_sha \}\}$/u
  );
  assert.match(marker.if, /^steps\.trigger\.outputs\.trusted == 'true' && /u);
  assert.deepEqual(
    migrate.steps
      .filter((s) => /secrets\./u.test(JSON.stringify(s.env ?? {})))
      .map((s) => s.name),
    ['Deploy migrations to staging']
  );
  const checkout = migrate.steps.find((s) =>
    s.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with['persist-credentials'], false);
  assert.match(
    checkout.with.ref,
    /^\$\{\{ steps\.trigger\.outputs\.head_sha \}\}$/u
  );
  assert.ok(
    migrate.steps.every((s) => !/\$\{\{\s*(?:env|secrets)\./u.test(s.run ?? ''))
  );
  assert.match(
    migrate.steps.find((s) => s.name === 'Deploy migrations to staging').run,
    /STAGING_PROJECT_ID.*fxefojytwimjiqxseqag/u
  );
});
