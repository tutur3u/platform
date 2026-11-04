const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  fixture,
  workflow,
  productionSha,
  stagingSha,
  workflowSha,
  stepScript,
} = require('./fixtures/production-migration-target-fixture.cjs');

const resolveStep = 'Resolve immutable production migration target';
const evaluateStep = 'Evaluate prerequisite status';

test('newer unpromoted staging completion resolves and gates only current production', (t) => {
  const setup = fixture(t, { CURRENT_SHA: workflowSha });
  assert.equal(setup.run(resolveStep).status, 0);
  assert.equal(setup.output(), `target_sha=${productionSha}\n`);
  assert.equal(
    setup.run(evaluateStep, { TARGET_SHA: productionSha }).status,
    0
  );
  assert.match(setup.output(), /should_deploy=true/);
  assert.doesNotMatch(setup.requests(), new RegExp(stagingSha));
  assert.doesNotMatch(
    setup
      .requests()
      .split('\n')
      .filter((line) => !line.startsWith('FETCH '))
      .join('\n'),
    new RegExp(workflowSha)
  );
  assert.match(setup.requests(), /git\/ref\/heads\/production/);
  assert.match(
    setup.requests(),
    /FETCH \/repos\/example\/platform\/deployments\?environment=supabase-staging&sha=aaaa/
  );
  assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/);
  const fetches = setup
    .requests()
    .split('\n')
    .filter((line) => line.startsWith('FETCH '));
  assert.equal(fetches.length, 16);
  assert.match(fetches[6], new RegExp(`ref=${workflowSha}$`));
  assert.match(fetches[9], new RegExp(`ref=${workflowSha}$`));
  assert.match(fetches[11], /attempts\/1\/jobs\?per_page=100&page=1$/);
  assert.deepEqual(fetches.slice(-4), [
    fetches[2],
    'FETCH /repos/example/platform/deployments/301',
    fetches[4],
    fetches[3],
  ]);
});

for (const [label, overrides, target] of [
  [
    'manual production pins dispatch commit',
    { EVENT_NAME: 'workflow_dispatch', CURRENT_REF_NAME: 'production' },
    productionSha,
  ],
  ['manual main stays prohibited', { EVENT_NAME: 'workflow_dispatch' }, ''],
  [
    'planner pins its successful production commit',
    {
      TRIGGER_WORKFLOW: 'Production Deployment Planner',
      TRIGGER_BRANCH: 'production',
    },
    stagingSha,
  ],
  [
    'planner from main stays prohibited',
    { TRIGGER_WORKFLOW: 'Production Deployment Planner' },
    '',
  ],
  [
    'failed staging does not re-evaluate',
    { TRIGGER_CONCLUSION: 'failure' },
    '',
  ],
  [
    'staging from another branch stays prohibited',
    { TRIGGER_BRANCH: 'other' },
    '',
  ],
  [
    'unknown workflow stays prohibited',
    { TRIGGER_WORKFLOW: 'Other workflow' },
    '',
  ],
]) {
  test(label, (t) => {
    const setup = fixture(t, overrides);
    assert.equal(setup.run(resolveStep).status, 0);
    assert.equal(setup.output(), `target_sha=${target}\n`);
    assert.equal(setup.requests(), '');
  });
}

for (const overrides of [
  { PRODUCTION_SHA: '' },
  { PRODUCTION_SHA: 'short' },
  { PRODUCTION_TYPE: 'tag' },
  { API_FAILURE: 'true' },
]) {
  test(`untrusted production resolution fails closed: ${JSON.stringify(overrides)}`, (t) => {
    const setup = fixture(t, overrides);
    assert.notEqual(setup.run(resolveStep).status, 0);
    assert.equal(setup.output(), '');
  });
}

for (const overrides of [
  { STAGING_RESULT: 'failure' },
  { STAGING_RESULT: 'skipped' },
  { STAGING_STATUS: 'in_progress' },
  { MARKER_STATE: 'failure' },
  { MARKER_STATE: 'failure', OLD_SUCCESS: 'true' },
  { MARKER_PAYLOAD: 'empty' },
  { MARKER_PAYLOAD: 'wrong-sha' },
  { DATABASE_AFFECTED: 'false' },
  { PLANNER_RESULT: 'failure' },
  { PLANNER_SHA: stagingSha },
  { PLANNER_BRANCH: 'main' },
  { STAGING_SHA: stagingSha },
  { STAGING_BRANCH: 'production' },
  { MARKER_SHA: stagingSha },
]) {
  test(`current production prerequisites remain required: ${JSON.stringify(overrides)}`, (t) => {
    const setup = fixture(t, overrides);
    const result = setup.run(evaluateStep, { TARGET_SHA: productionSha });
    const stagingRejected = Object.keys(overrides).some((key) =>
      key.startsWith('STAGING_')
    );
    if (stagingRejected) {
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /Exact-source staging proof unavailable or changed/
      );
      assert.equal(setup.output(), '');
      assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/);
      const fetches = setup
        .requests()
        .split('\n')
        .filter((line) => line.startsWith('FETCH '));
      assert.equal(fetches.length, overrides.STAGING_SHA ? 3 : 4);
      assert.match(
        fetches.at(-1),
        overrides.STAGING_SHA ? /deployments\?/ : /actions\/runs\/201$/
      );
    } else {
      assert.equal(result.status, 0);
      assert.equal(setup.output(), 'should_deploy=false\n');
      assert.doesNotMatch(setup.requests(), /FETCH /);
    }
    assert.doesNotMatch(setup.output(), /should_deploy=true/);
  });
}

test('resolved immutable target precedes checkout and pending-range configuration', () => {
  const resolve = workflow.indexOf(`      - name: ${resolveStep}`);
  const checkout = workflow.indexOf('Check out trusted prerequisite tooling');
  const diff = workflow.indexOf(
    '      - name: Compute pending migration changes'
  );
  const config = workflow.indexOf(
    '      - name: Check migration configuration'
  );
  assert.ok(resolve < checkout && checkout < diff && diff < config);
  assert.match(workflow, /--head-sha "\$TARGET_SHA" --ref-name production/);
  assert.match(
    workflow,
    /target_sha: \$\{\{ steps\.resolve_target\.outputs\.target_sha \}\}/
  );
  assert.doesNotMatch(stepScript(evaluateStep), /TARGET_SHA=""/);
  assert.match(workflow, /cancel-in-progress: false/);
});

function expressionValue(expression, github) {
  // These actual workflow expressions use the shared JS/GHA boolean/string
  // operators and format(), so synthetic events exercise their admission values.
  return vm.runInNewContext(
    expression,
    {
      github,
      format: (pattern, value) => pattern.replace('{0}', String(value)),
    },
    { timeout: 100 }
  );
}

function requiredExpression(pattern, description) {
  const match = workflow.match(pattern);
  assert.ok(match, `Missing ${description}; expected ${pattern}`);
  return match[1];
}

const concurrencyExpression = requiredExpression(
  / {2}group: \$\{\{ (.*) \}\}/,
  'top-level migration concurrency expression'
);
const admissionExpression = requiredExpression(
  /name: Evaluate production prerequisites\n {4}if: \$\{\{ (.*) \}\}/,
  'evaluate-prerequisites admission expression'
);

for (const conclusion of [
  'failure',
  'cancelled',
  'timed_out',
  'skipped',
  'neutral',
  null,
]) {
  test(`ignored ${conclusion} callback cannot replace a pending migration`, () => {
    const event = {
      event_name: 'workflow_run',
      run_id: 41,
      event: { workflow_run: { conclusion } },
    };
    assert.equal(expressionValue(admissionExpression, event), false);
    assert.equal(
      expressionValue(concurrencyExpression, event),
      'supabase-production-migration-ignored-41'
    );
    assert.equal(
      expressionValue(concurrencyExpression, { ...event, run_id: 42 }),
      'supabase-production-migration-ignored-42'
    );
  });
}

for (const [label, event] of [
  [
    'manual production',
    {
      event_name: 'workflow_dispatch',
      ref: 'refs/heads/production',
      event: {},
    },
  ],
  [
    'production planner',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Production Deployment Planner',
          head_branch: 'production',
          event: 'push',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
  [
    'main staging',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Supabase Staging Migration',
          head_branch: 'main',
          event: 'workflow_run',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
]) {
  test(`eligible ${label} migration retains the global serialized group`, () => {
    const context = { ...event, run_id: 43 };
    assert.equal(expressionValue(admissionExpression, context), true);
    assert.equal(
      expressionValue(concurrencyExpression, context),
      'supabase-production-migration'
    );
    assert.match(workflow, /cancel-in-progress: false/);
  });
}

for (const [label, event] of [
  [
    'staging on production',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Supabase Staging Migration',
          head_branch: 'production',
          event: 'workflow_run',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
  [
    'planner on main',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Production Deployment Planner',
          head_branch: 'main',
          event: 'push',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
  [
    'unexpected successful workflow',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Other workflow',
          head_branch: 'production',
          event: 'push',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
  [
    'fork planner named after the producer',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Production Deployment Planner',
          head_branch: 'production',
          event: 'pull_request',
          head_repository: { full_name: 'attacker/platform' },
        },
      },
    },
  ],
  [
    'fork head repository planner',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Production Deployment Planner',
          head_branch: 'production',
          event: 'push',
          head_repository: { full_name: 'attacker/platform' },
        },
      },
    },
  ],
  [
    'same-repository pull request planner',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Production Deployment Planner',
          head_branch: 'production',
          event: 'pull_request',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
  [
    'fork staging named after the producer',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Supabase Staging Migration',
          head_branch: 'main',
          event: 'pull_request',
          head_repository: { full_name: 'attacker/platform' },
        },
      },
    },
  ],
  [
    'fork head repository staging',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Supabase Staging Migration',
          head_branch: 'main',
          event: 'workflow_run',
          head_repository: { full_name: 'attacker/platform' },
        },
      },
    },
  ],
  [
    'same-repository pull request staging',
    {
      event_name: 'workflow_run',
      repository: 'example/platform',
      event: {
        workflow_run: {
          conclusion: 'success',
          name: 'Supabase Staging Migration',
          head_branch: 'main',
          event: 'pull_request',
          head_repository: { full_name: 'example/platform' },
        },
      },
    },
  ],
  [
    'manual main',
    { event_name: 'workflow_dispatch', ref: 'refs/heads/main', event: {} },
  ],
  [
    'manual tag named production',
    { event_name: 'workflow_dispatch', ref: 'refs/tags/production', event: {} },
  ],
]) {
  test(`ineligible ${label} cannot displace a legitimate pending migration`, () => {
    const context = { ...event, run_id: 47 };
    assert.equal(expressionValue(admissionExpression, context), false);
    assert.equal(
      expressionValue(concurrencyExpression, context),
      'supabase-production-migration-ignored-47'
    );
  });
}

for (const [target, wrapper] of [
  ['old', 'old'],
  ['new', 'old'],
  ['old', 'new'],
  ['unknown', 'new'],
  ['new', 'unknown'],
  ['unknown', 'unknown'],
]) {
  test(`producer contract target=${target} wrapper=${wrapper}`, (t) => {
    const setup = fixture(t, {
      TARGET_CONTRACT: target,
      WRAPPER_CONTRACT: wrapper,
    });
    const result = setup.run(evaluateStep, { TARGET_SHA: productionSha });
    const denied = [target, wrapper].includes('unknown') || wrapper === 'new';
    assert.equal(result.status === 0, !denied);
    assert.equal(setup.output(), denied ? '' : 'should_deploy=true\n');
    assert.doesNotMatch(setup.requests(), /FETCH_FIXTURE_UNEXPECTED/);
    if (denied)
      assert.match(
        result.stderr,
        /Exact-source staging proof unavailable or changed/
      );
    else
      assert.equal(
        setup
          .requests()
          .split('\n')
          .filter((line) => line.startsWith('FETCH ')).length,
        target === wrapper ? 16 : 17
      );
  });
}

test('staging config and admission execute on app-only checkouts without helpers', (t) => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/supabase-staging.yaml'),
    'utf8'
  );
  const config = stepScript('Check migration configuration', source);
  const evaluate = stepScript('Evaluate staging prerequisites', source);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const value of ['true', 'false', 'undefined', '"true"']) {
    const output = path.join(directory, 'output');
    fs.writeFileSync(output, '');
    fs.writeFileSync(
      path.join(directory, 'tuturuuu.ci.ts'),
      `export const ci = { 'supabase-staging.yaml': ${value} };`
    );
    const env = {
      ...process.env,
      GITHUB_OUTPUT: output,
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
    };
    const result = spawnSync('bash', ['-c', config], {
      cwd: directory,
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status === 0, ['true', 'false'].includes(value));
    assert.equal(
      fs.readFileSync(output, 'utf8'),
      ['true', 'false'].includes(value) ? `should_run=${value}\n` : ''
    );
    if (result.status !== 0) continue;
    for (const [event, conclusion] of [
      ['push', ''],
      ['workflow_run', 'success'],
      ['workflow_run', 'failure'],
      ['workflow_dispatch', ''],
    ]) {
      fs.writeFileSync(output, '');
      const admission = spawnSync('bash', ['-c', evaluate], {
        env: {
          ...env,
          STAGING_ENABLED: value,
          EVENT_NAME: event,
          TRIGGER_CONCLUSION: conclusion,
        },
        encoding: 'utf8',
      });
      assert.equal(admission.status, 0);
      assert.equal(
        fs.readFileSync(output, 'utf8'),
        `should_deploy=${value === 'true' && ['workflow_dispatch', 'push'].includes(event)}\n`
      );
    }
  }
});
