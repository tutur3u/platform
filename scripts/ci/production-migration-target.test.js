const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/supabase-production.yaml'),
  'utf8'
);
const productionSha = 'a'.repeat(40);
const stagingSha = 'b'.repeat(40);

function stepScript(name) {
  const block = workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(block, `missing workflow step ${name}`);
  const script = block.split('        run: |\n')[1];
  assert.ok(script, `missing shell body for ${name}`);
  return script
    .split('\n')
    .slice(
      0,
      script
        .split('\n')
        .findIndex((line) => line && !line.startsWith('          '))
    )
    .map((line) => line.slice(10))
    .join('\n')
    .replaceAll(/\$\{\{ github\.repository \}\}/g, 'example/platform');
}

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-target-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, 'requests');
  const output = path.join(directory, 'output');
  const environment = path.join(directory, 'environment');
  fs.writeFileSync(output, '');
  fs.writeFileSync(environment, '');
  fs.writeFileSync(
    path.join(directory, 'gh'),
    `#!${process.execPath}
const fs = require('node:fs');
const request = process.argv[3];
fs.appendFileSync(process.env.REQUEST_LOG, request + '\\n');
if (process.env.API_FAILURE === 'true') process.exit(1);
const sha = process.env.PRODUCTION_SHA;
if (request.endsWith('/git/ref/heads/production')) {
  process.stdout.write(sha);
} else if (request.includes('/actions/workflows/')) {
  if (!request.includes('head_sha=' + sha)) process.exit(9);
  const staging = request.includes('supabase-staging');
  process.stdout.write(JSON.stringify({
    head_sha: staging ? process.env.STAGING_SHA : process.env.PLANNER_SHA,
    head_branch: staging ? process.env.STAGING_BRANCH : process.env.PLANNER_BRANCH,
    conclusion: staging ? process.env.STAGING_RESULT : process.env.PLANNER_RESULT,
    status: staging ? process.env.STAGING_STATUS : 'completed'
  }));
} else if (request.includes('/deployments?')) {
  process.stdout.write(JSON.stringify([{id: 17, sha: process.env.MARKER_SHA, payload: {
    sha: process.env.MARKER_SHA, markerKind: 'deployment', workflowName: 'vercel-production-platform.yaml'
  }}]));
} else if (request.endsWith('/deployments/17/statuses')) {
  process.stdout.write(JSON.stringify([{state: process.env.MARKER_STATE}]));
} else process.exit(8);
`,
    { mode: 0o755 }
  );
  const env = {
    ...process.env,
    PATH: `${directory}${path.delimiter}${process.env.PATH}`,
    GITHUB_OUTPUT: output,
    GITHUB_ENV: environment,
    REQUEST_LOG: log,
    GH_TOKEN: 'synthetic-test-only',
    REPOSITORY: 'example/platform',
    CURRENT_SHA: productionSha,
    CURRENT_REF_NAME: 'main',
    EVENT_NAME: 'workflow_run',
    TRIGGER_BRANCH: 'main',
    TRIGGER_CONCLUSION: 'success',
    TRIGGER_SHA: stagingSha,
    TRIGGER_WORKFLOW: 'Supabase Staging Migration',
    PRODUCTION_SHA: productionSha,
    DATABASE_AFFECTED: 'true',
    STAGING_RESULT: 'success',
    STAGING_SHA: productionSha,
    STAGING_BRANCH: 'main',
    PLANNER_SHA: productionSha,
    PLANNER_BRANCH: 'production',
    PLANNER_RESULT: 'success',
    MARKER_SHA: productionSha,
    STAGING_STATUS: 'completed',
    MARKER_STATE: 'success',
    ...overrides,
  };
  return {
    run(name, extra = {}) {
      return spawnSync('bash', ['-c', stepScript(name)], {
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    },
    output: () => fs.readFileSync(output, 'utf8'),
    requests: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''),
  };
}

const resolveStep = 'Resolve immutable production migration target';
const evaluateStep = 'Evaluate prerequisite status';

test('newer unpromoted staging completion resolves and gates only current production', (t) => {
  const setup = fixture(t);
  assert.equal(setup.run(resolveStep).status, 0);
  assert.equal(setup.output(), `target_sha=${productionSha}\n`);
  assert.equal(
    setup.run(evaluateStep, { TARGET_SHA: productionSha }).status,
    0
  );
  assert.match(setup.output(), /should_deploy=true/);
  assert.doesNotMatch(setup.requests(), new RegExp(stagingSha));
  assert.match(setup.requests(), /git\/ref\/heads\/production/);
  assert.match(
    setup.requests(),
    /supabase-staging\.yaml\/runs\?branch=main&head_sha=aaaa/
  );
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
    assert.equal(
      setup.run(evaluateStep, { TARGET_SHA: productionSha }).status,
      0
    );
    assert.equal(setup.output(), 'should_deploy=false\n');
  });
}

test('resolved immutable target precedes checkout and pending-range configuration', () => {
  const resolve = workflow.indexOf(`      - name: ${resolveStep}`);
  const checkout = workflow.indexOf('      - name: Check out migration target');
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
  assert.match(
    workflow,
    /group: supabase-production-migration\n {2}cancel-in-progress: false/
  );
});
