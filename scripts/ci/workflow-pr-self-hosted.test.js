const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {
  readAllWorkflows,
  readWorkflow,
} = require('./workflow-yaml-test-helper');

const selected = {
  'i18n-check.yaml': [
    'i18n-sort-check',
    'i18n-translation-check',
    'i18n-key-parity-check',
    'i18n-namespace-check',
  ],
  'docs-seo-check.yaml': ['validate'],
  'mobile-api-mappings.yaml': ['verify'],
  'type-check.yaml': ['type-check'],
  'biome-check.yaml': ['duplicate-validation', 'format', 'lint'],
  'turbo-unit-tests.yaml': ['test-shards'],
};
const routedViaInput = ['biome-check.yaml:check-ci'];
const poolSelectors = ['ci-check.yml:check'];
const workflows = readAllWorkflows();
const labels = ['self-hosted', 'macOS', 'ARM64', 'tuturuuu-pr-ephemeral'];
const hosted = `\${{ runner.environment != 'self-hosted' }}`;
const event = (overrides = {}) => ({
  event_name: 'pull_request',
  repository: 'tutur3u/platform',
  actor: 'maintainer',
  triggering_actor: 'maintainer',
  event: {
    pull_request: {
      number: 123,
      head: { repo: { full_name: 'tutur3u/platform' } },
      user: { login: 'maintainer' },
    },
  },
  ...overrides,
});
function strings(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}
function route(expression, github, value) {
  return vm.runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
    github,
    vars: { PR_SELF_HOSTED_RUNNERS: value },
    fromJSON: JSON.parse,
    format: (template, number) => template.replace('{0}', number),
  });
}

test('all routed jobs default hosted and reject forks, bots, targets and non-PR events', () => {
  for (const [file, ids] of Object.entries(selected)) {
    for (const id of ids) {
      const expression = workflows[file].jobs[id]['runs-on'];
      assert.deepEqual(route(expression, event(), 'true'), labels);
      assert.deepEqual(route(expression, event(), 'pr:123'), labels);
      for (const value of ['', undefined, 'false', 'pr:124']) {
        assert.equal(route(expression, event(), value), 'ubuntu-latest');
      }
      for (const name of [
        'pull_request_target',
        'push',
        'workflow_dispatch',
        'workflow_call',
        'schedule',
      ]) {
        assert.equal(
          route(expression, event({ event_name: name, event: {} }), 'true'),
          'ubuntu-latest'
        );
      }
      for (const key of ['actor', 'triggering_actor']) {
        assert.equal(
          route(expression, event({ [key]: 'dependabot[bot]' }), 'true'),
          'ubuntu-latest'
        );
      }
      const fork = event();
      fork.event.pull_request.head.repo.full_name = 'attacker/platform';
      assert.equal(route(expression, fork, 'true'), 'ubuntu-latest');
      const botAuthor = event();
      botAuthor.event.pull_request.user.login = 'dependabot[bot]';
      assert.equal(route(expression, botAuthor, 'true'), 'ubuntu-latest');
    }
  }
});

test('only allowlisted read-only, secret-free portable jobs can select the Mac pool', () => {
  const actual = [];
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (
        !JSON.stringify(job['runs-on'] ?? '').includes('tuturuuu-pr-ephemeral')
      )
        continue;
      actual.push(`${file}:${id}`);
      for (const level of Object.values(
        job.permissions ?? workflow.permissions
      ))
        assert.equal(level, 'read');
      assert.equal(job.environment, undefined);
      assert.equal(job.services, undefined);
      assert.equal(job.container, undefined);
      assert.doesNotMatch(
        JSON.stringify([workflow.env, job]),
        /secrets:|docker:\/\/|apt-get|sudo |ubuntu.sources/
      );
      // Secret references must be expanded only for non-PR events: evaluate
      // each against a context whose secrets all leak, as a pull request.
      for (const text of strings([workflow.env, job]).filter((t) =>
        t.includes('secrets.')
      )) {
        const leaky = new Proxy({}, { get: () => 'LEAK' });
        const value = vm.runInNewContext(
          text.replace(/^\$\{\{\s*|\s*\}\}$/g, ''),
          {
            github: {
              event_name: 'pull_request',
              actor: 'maintainer',
              ref: 'refs/pull/1/merge',
            },
            secrets: leaky,
            vars: leaky,
          }
        );
        assert.equal(value, '', text);
      }
      for (const step of job.steps) {
        const installs = (step.run ?? '')
          .split('\n')
          .filter(
            (line) =>
              /^\s*(bash scripts\/ci\/run-with-backoff\.sh )?bun (install|i)\b/.test(
                line
              ) && !line.includes('--lockfile-only')
          );
        if (installs.length) {
          assert.match(
            step.run,
            /bun install --frozen-lockfile \$BUN_INSTALL_FLAGS/
          );
          assert.equal(
            step.env.BUN_INSTALL_FLAGS,
            "${{ runner.environment == 'self-hosted' && '--ignore-scripts' || '' }}"
          );
        }
      }
      const checkout = job.steps.find((s) =>
        s.uses?.startsWith('actions/checkout@')
      );
      assert.equal(checkout.with.clean, true);
      assert.ok([false, hosted].includes(checkout.with['persist-credentials']));
      const hygiene = job.steps.findIndex(
        (s) => s.uses === './.github/actions/pr-runner-hygiene'
      );
      assert.equal(hygiene, job.steps.indexOf(checkout) + 1);
      assert.equal(
        job.steps[hygiene].if,
        "runner.environment == 'self-hosted'"
      );
      const node = job.steps.find((s) =>
        s.uses?.startsWith('actions/setup-node@')
      );
      if (node)
        assert.ok([false, hosted].includes(node.with['package-manager-cache']));
      const bun = job.steps.find(
        (s) => s.uses === './.github/actions/setup-bun-with-retry'
      );
      if (bun?.with['cache-enabled'] !== undefined)
        assert.equal(bun.with['cache-enabled'], hosted);
    }
  }
  assert.deepEqual(
    actual.sort(),
    [
      ...poolSelectors,
      ...Object.entries(selected).flatMap(([file, ids]) =>
        ids.map((id) => `${file}:${id}`)
      ),
    ].sort()
  );
  const passers = [];
  for (const [file, workflow] of Object.entries(workflows))
    for (const [id, job] of Object.entries(workflow.jobs))
      if (job.with?.pr_runner !== undefined) passers.push(`${file}:${id}`);
  assert.deepEqual(passers, routedViaInput);
  const callerRoute =
    workflows['biome-check.yaml'].jobs['check-ci'].with.pr_runner;
  const jobRoute = workflows['biome-check.yaml'].jobs.lint['runs-on'];
  assert.ok(jobRoute.includes(callerRoute.replace(/^\$\{\{\s*|\s*\}\}$/g, '')));
  assert.equal(
    workflows['ci-check.yml'].on.workflow_call.inputs.pr_runner.default,
    false
  );
  for (const job of ['apply-format', 'close-outdated-format-pr', 'comment'])
    assert.equal(
      workflows['biome-check.yaml'].jobs[job]['runs-on'],
      'ubuntu-latest'
    );
  assert.equal(
    readWorkflow('i18n-check.yaml').jobs.comment['runs-on'],
    'ubuntu-latest'
  );
});

test('Bun cache operations require explicit cache admission; cleanup is an always post action', () => {
  const action = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../.github/actions/setup-bun-with-retry/action.yml'
    ),
    'utf8'
  );
  const cacheConditions = action
    .split('\n')
    .filter((line) => line.includes('      if:'));
  assert.equal(cacheConditions.length, 4);
  for (const line of cacheConditions)
    assert.ok(line.includes("inputs['cache-enabled'] == 'true'"));
  const hygiene = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../.github/actions/pr-runner-hygiene/action.yml'
    ),
    'utf8'
  );
  assert.match(hygiene, /post: index\.js/);
  assert.match(hygiene, /post-if: always\(\)/);
});
