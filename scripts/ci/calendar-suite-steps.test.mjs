import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { readWorkflow } = createRequire(import.meta.url)(
  './workflow-yaml-test-helper.js'
);
const suites = ['Calendar', 'Web', 'shared Tasks'];
const commands = ['apps/calendar', 'apps/web', 'packages/tasks-ui'];

function assertSuiteSteps(workflow) {
  const job = workflow.jobs['calendar-native'];
  assert.equal(job.needs, 'check-ci');
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(job.env.CALENDAR_DEPLOYMENT_PROFILE, 'production');
  assert.equal(
    job.env.NEXT_PUBLIC_SUPABASE_URL,
    'https://calendar-ci.supabase.invalid'
  );
  assert.equal(
    job.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'sb_publishable_calendar_ci_placeholder'
  );
  assert.equal(job.env.NEXT_PUBLIC_APP_URL, 'https://calendar-ci.invalid');
  assert.equal(job.env.NEXT_PUBLIC_WEB_APP_URL, 'https://tuturuuu.com');
  assert.equal(
    job.env.SUPABASE_SECRET_KEY,
    'calendar_ci_private_canary_never_ship_349'
  );
  const steps = job.steps;
  const locate = (name) => {
    const matches = steps.filter((step) => step.name === name);
    assert.equal(matches.length, 1, name);
    return steps.indexOf(matches[0]);
  };
  const build = locate(
    'Build shared dependencies without a legacy Calendar build'
  );
  assert.equal(
    steps[build].with.command,
    "bun turbo:local run build --filter='@tuturuuu/calendar^...' --filter='@tuturuuu/web^...' --concurrency=2"
  );
  assert.ok(
    build < locate('Build native Calendar with the official Void plugin')
  );
  let previous = locate('Reject tracked Calendar route tree drift');
  assert.ok(
    locate('Build native Calendar with the official Void plugin') < previous
  );
  suites.forEach((suite, index) => {
    const position = locate(`Run owning ${suite} tests`);
    assert.equal(position, previous + 1);
    assert.deepEqual(steps[position], {
      name: `Run owning ${suite} tests`,
      run: `bun run --cwd ${commands[index]} test`,
    });
    previous = position;
  });
  for (const name of [
    'Discover and qualify emitted Worker config',
    'Generate bindings from the actual emitted config',
    'Check Calendar native Worker and affected Web Tasks consumers',
    'Seal source and emitted artifact identity',
    'Exercise exact emitted Worker public routes',
    'Verify runtime checks left the sealed artifact unchanged',
  ]) {
    const position = locate(name);
    assert.ok(position > previous);
    assert.equal(steps[position].if, undefined);
    assert.equal(steps[position]['continue-on-error'], undefined);
    previous = position;
  }
  assert.equal(
    workflow.jobs['calendar-artifact-restore'].needs,
    'calendar-native'
  );
}

test('owning suites retain sequential build dependencies, fixtures and acceptance barriers', () => {
  assertSuiteSteps(readWorkflow('mail-calendar-tasks-builds.yaml'));
});

test('suite timing guards reject command, order, environment and success-barrier weakening', () => {
  for (const mutate of [
    (w, s) => {
      s[0].run = 'true';
    },
    (w, s) => {
      s[1].if = 'always()';
    },
    (w, s) => {
      s[2]['continue-on-error'] = true;
    },
    (w, s) => {
      s[0].env = { CALENDAR_DEPLOYMENT_PROFILE: 'staging' };
    },
    (w) => {
      w.jobs['calendar-native'].env.CALENDAR_DEPLOYMENT_PROFILE = 'staging';
    },
    (w, s) => {
      const steps = w.jobs['calendar-native'].steps;
      steps.splice(steps.indexOf(s[1]), 1);
      steps.unshift(s[1]);
    },
    (w) => {
      w.jobs['calendar-artifact-restore'].needs = 'check-ci';
    },
  ]) {
    const workflow = readWorkflow('mail-calendar-tasks-builds.yaml');
    const steps = suites.map((suite) =>
      workflow.jobs['calendar-native'].steps.find(
        (s) => s.name === `Run owning ${suite} tests`
      )
    );
    assert.ok(steps.every(Boolean));
    mutate(workflow, steps);
    assert.throws(() => assertSuiteSteps(workflow));
  }
});
