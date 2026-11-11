const assert = require('node:assert/strict');
const test = require('node:test');
const {
  HOST_LABELS,
  ROUTE,
  lintSelfHostedWorkflows,
} = require('./self-hosted-policy');
const { evaluateExpression } = require('./github-expression-test-helper');
const vm = require('node:vm');
const route = (scope) =>
  vm.runInNewContext(ROUTE.slice(3, -2), {
    ...scope,
    fromJSON: JSON.parse,
    contains: (values, value) => values.includes(value),
    format: (template, value) => template.replace('{0}', value),
  });
const { readAllWorkflows } = require('./workflow-yaml-test-helper');
const workflows = readAllWorkflows(undefined, { raw: true });
const context = (value, overrides = {}) => ({
  vars: { CI_VALIDATION_RUNNER: value },
  github: {
    event_name: 'pull_request',
    repository: 'tutur3u/platform',
    event: {
      pull_request: {
        head: { repo: { id: 1, full_name: 'tutur3u/platform' } },
        base: { repo: { id: 1, full_name: 'tutur3u/platform' } },
      },
    },
    ...overrides,
  },
});
test('CI runner lint rejects every unauthorized use of host labels', () => {
  assert.deepEqual(lintSelfHostedWorkflows(workflows), []);
  const copy = structuredClone(workflows);
  copy['rogue.yaml'] = {
    jobs: { rogue: { 'runs-on': ['self-hosted', HOST_LABELS[0]] } },
  };
  assert.ok(lintSelfHostedWorkflows(copy).length);
  for (const mutate of [
    (job) => {
      job['runs-on'] = ROUTE.replace(
        "github.event_name == 'pull_request' && ",
        ''
      );
    },
    (job) => {
      job['runs-on'] = ROUTE.replace(
        'head.repo.id == github.event.pull_request.base.repo.id',
        'head.repo.id != github.event.pull_request.base.repo.id'
      );
    },
    (job) => {
      job.permissions['id-token'] = 'write';
    },
    (job) => {
      job.permissions.contents = 'write';
    },
    (job) => {
      job.env = { TOKEN: '${{ secrets.TEST }}' };
    },
    (job) => {
      job.steps.push({ uses: 'actions/cache@deadbeef' });
    },
    (job) => {
      job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with[
        'persist-credentials'
      ] = true;
    },
  ]) {
    const broken = structuredClone(workflows);
    mutate(broken['type-check.yaml'].jobs['type-check-pr']);
    assert.ok(lintSelfHostedWorkflows(broken).length);
  }
});
test('unset, malformed and unsupported routing values fail closed to hosted', () => {
  for (const value of [
    '',
    undefined,
    'true',
    'self-hosted',
    'ttr-selfhosted-unknown',
    '["self-hosted"]',
  ]) {
    assert.equal(route(context(value)), 'ubuntu-latest');
  }
  for (const label of HOST_LABELS) {
    assert.deepEqual(route(context(label)), ['self-hosted', label]);
    for (const event_name of [
      'push',
      'pull_request_target',
      'workflow_dispatch',
    ]) {
      assert.equal(
        route(context(label, { event_name, event: {} })),
        'ubuntu-latest'
      );
    }
    const fork = context(label);
    fork.github.event.pull_request.head.repo = {
      id: 2,
      full_name: 'fork/platform',
    };
    assert.equal(route(fork), 'ubuntu-latest');
  }
});

test('transitive cache actions never save pull-request archives', () => {
  const { execFileSync } = require('node:child_process');
  for (const action of ['setup-turbo-fallback-cache', 'setup-bun-with-retry']) {
    const parsed = JSON.parse(
      execFileSync(
        'bun',
        [
          '-e',
          'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
          `.github/actions/${action}/action.yml`,
        ],
        { encoding: 'utf8' }
      )
    );
    for (const step of parsed.runs.steps) {
      if (!step.uses?.startsWith('actions/cache@')) continue;
      const scope = context(HOST_LABELS[0]);
      scope.inputs = {
        'cache-enabled': 'true',
        'package-cache-enabled': 'true',
      };
      scope.github.ref = 'refs/pull/42/merge';
      assert.equal(
        evaluateExpression(step.if, scope),
        false,
        `${action}:${step.name}`
      );
    }
  }
});

test('required Test root-script CI invokes runner lint before dependency execution', () => {
  const steps =
    workflows['turbo-unit-tests.yaml'].jobs['root-script-tests'].steps;
  const index = steps.findIndex(
    (step) => step.run === 'node scripts/ci/self-hosted-policy.js'
  );
  assert.ok(index >= 0);
  assert.ok(
    index < steps.findIndex((step) => step.name === 'Install dependencies')
  );
});
