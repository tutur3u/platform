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
  'type-check.yaml': ['type-check-pr'],
  'biome-check.yaml': ['duplicate-validation', 'format', 'lint'],
  'turbo-unit-tests.yaml': ['test-shards-pr'],
};
const routedViaInput = ['biome-check.yaml:check-ci'];
const poolSelectors = ['ci-check.yml:check'];
const workflows = readAllWorkflows();
// Jobs that keep secrets run only for non-PR events, on hosted runners. Each
// shares its display name (and so its required check context) with the routed
// pull request variant; exactly one of the pair runs per event.
const splitPairs = [
  ['type-check.yaml', 'type-check', 'type-check-pr'],
  ['turbo-unit-tests.yaml', 'test-shards', 'test-shards-pr'],
];
const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const poolLabel = 'tuturuuu-pr-ephemeral';

// Raw text of one top-level job (comments and every expression included), so a
// secret named behind a false guard cannot hide from the assertion.
function rawJobBlock(file, id) {
  const lines = fs
    .readFileSync(path.join(workflowsDir, file), 'utf8')
    .split('\n');
  const start = lines.indexOf(`  ${id}:`);
  assert.notEqual(start, -1, `${file}:${id}`);
  let end = lines.findIndex(
    (line, index) => index > start && /^ {2}[\w-]+:\s*$/.test(line)
  );
  if (end === -1) end = lines.length;
  return lines.slice(start, end).join('\n');
}
function rawWorkflowPreamble(file) {
  const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
  return text.slice(0, text.indexOf('\njobs:\n'));
}
const labels = ['self-hosted', 'macOS', 'ARM64', 'tuturuuu-pr-ephemeral'];
const ignoreScripts = `\${{ runner.environment == 'self-hosted' && '--ignore-scripts' || '' }}`;
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
      // GitHub ships every secret a job names to its runner, even behind a
      // guard that evaluates to ''. A pool-eligible job (and the workflow-level
      // text it inherits) must therefore not contain the substring at all.
      assert.ok(!rawJobBlock(file, id).includes('secrets.'), `${file}:${id}`);
      assert.ok(!rawWorkflowPreamble(file).includes('secrets.'), file);
      for (const step of job.steps) {
        const installs = (step.run ?? '')
          .split('\n')
          .filter(
            (line) =>
              /^\s*(bash scripts\/ci\/run-with-backoff\.sh )?bun (install|i)\b/.test(
                line
              ) && !line.includes('--lockfile-only')
          );
        const alwaysScriptFree = installs.every((line) =>
          /^(?:bash scripts\/ci\/run-with-backoff\.sh )?bun install --frozen-lockfile --ignore-scripts$/.test(
            line.trim()
          )
        );
        if (installs.length && !alwaysScriptFree) {
          assert.match(
            step.run,
            /bun install --frozen-lockfile \$BUN_INSTALL_FLAGS/
          );
          assert.equal(step.env.BUN_INSTALL_FLAGS, ignoreScripts);
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
  for (const [file, workflow] of Object.entries(workflows))
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (!job.uses || job.with?.pr_runner === undefined) continue;
      // A reusable workflow that can run on the pool is called without secrets.
      assert.equal(job.secrets, undefined, `${file}:${id}`);
      const raw = rawJobBlock(file, id);
      assert.doesNotMatch(raw, /secrets/);
      const callee = workflows[path.basename(job.uses)];
      assert.ok(callee, job.uses);
      assert.equal(callee.on.workflow_call.secrets, undefined, job.uses);
    }
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

test('secret-bearing variants never reach the pool and share check contexts with the routed variants', () => {
  for (const [file, secretId, poolId] of splitPairs) {
    const secretJob = workflows[file].jobs[secretId];
    const poolJob = workflows[file].jobs[poolId];
    assert.equal(secretJob['runs-on'], 'ubuntu-latest');
    assert.ok(!JSON.stringify(secretJob).includes(poolLabel));
    assert.ok(
      JSON.stringify(poolJob['runs-on']).includes(poolLabel),
      `${file}:${poolId}`
    );
    assert.equal(secretJob.name, poolJob.name);
    assert.match(String(poolJob.if), /github\.event_name == 'pull_request'/);
    assert.match(String(secretJob.if), /github\.event_name != 'pull_request'/);
    // The variant that keeps secrets still names them; the routed one must not.
    assert.ok(rawJobBlock(file, secretId).includes('secrets.'));
    assert.ok(!rawJobBlock(file, poolId).includes('secrets.'));
  }
});

test('unit-test consumers accept exactly one successful shard variant', () => {
  const jobs = workflows['turbo-unit-tests.yaml'].jobs;
  for (const id of [
    'coverage-shards',
    'coverage-upload',
    'coverage-result',
    'build',
  ]) {
    assert.ok(jobs[id].needs.includes('test-shards'), id);
    assert.ok(jobs[id].needs.includes('test-shards-pr'), id);
  }
  // A skipped variant would otherwise skip every dependent without a status
  // function in its condition.
  for (const id of [
    'coverage-shards',
    'coverage-upload',
    'coverage-result',
    'build',
  ])
    assert.match(String(jobs[id].if), /!cancelled\(\)/, id);
  // The shell sees the result of whichever variant ran, never a skipped mask.
  const resultOf = (expression, pr, other) =>
    vm.runInNewContext(
      expression
        .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
        .replace(/needs\.([a-z-]+)/g, (_, id) => `needs['${id}']`),
      {
        needs: {
          'test-shards': { result: other },
          'test-shards-pr': { result: pr },
        },
      }
    );
  const resultSteps = {
    'coverage-shards': 'Require shared test execution',
    'coverage-result': 'Require tests and coverage upload',
    build: 'Require every unit-test shard',
  };
  for (const [id, name] of Object.entries(resultSteps)) {
    const step = jobs[id].steps.find((step) => step.name === name);
    assert.ok(step, id);
    const expression = step.env?.TEST_RESULT;
    assert.equal(typeof expression, 'string', id);
    assert.ok(!expression.includes('secrets'));
    for (const result of ['success', 'failure', 'cancelled']) {
      assert.equal(resultOf(expression, 'skipped', result), result, id);
      assert.equal(resultOf(expression, result, 'skipped'), result, id);
    }
    assert.equal(resultOf(expression, 'skipped', 'skipped'), 'skipped', id);
    assert.equal(resultOf(expression, 'success', 'success'), 'invalid', id);
  }
});
