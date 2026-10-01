const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const root = path.resolve(__dirname, '../..');
const workflow = readWorkflow('type-check.yaml');
const job = workflow.jobs['type-check'];
const decision =
  "steps.check_config.outputs.should_run == 'true' && steps.release_relevance.outputs.run_checks == 'true'";
const preflightIds = ['changed_files', 'check_config', 'release_relevance'];
const heavyNames = [
  'Setup Bun',
  'Restore Turbo fallback cache',
  'Install dependencies',
  'Build workspace dependencies',
  'Run type check',
];
const expression = (body) => `\${{ ${body} }}`;

test('singleton keeps the Type Check context, event surface and runner with a read-only token', () => {
  assert.equal(workflow.name, 'TypeScript Type Check');
  assert.deepEqual(workflow.on, { push: null, workflow_dispatch: null });
  assert.deepEqual(Object.keys(workflow.jobs), ['type-check']);
  assert.equal(job.name, 'Type Check');
  assert.equal(job['runs-on'], 'ubuntu-latest');
  for (const object of [workflow, job]) {
    assert.equal(object.concurrency, undefined);
  }
  assert.equal(workflow.permissions, undefined);
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job.needs, undefined);
  assert.equal(job.if, undefined);
  const checkouts = job.steps.filter((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, expression('github.sha'));
  assert.equal(checkouts[0].with['fetch-depth'], 0);
  assert.equal(checkouts[0].with['sparse-checkout'], undefined);
  const setupNode = job.steps.find((step) =>
    step.uses?.startsWith('actions/setup-node@')
  );
  assert.equal(setupNode.with['node-version'], 24);
  assert.ok(
    job.steps.indexOf(setupNode) <
      job.steps.findIndex((step) => step.id === 'changed_files')
  );
});

test('same preflight scripts precede every heavy step without error overrides', () => {
  const shared = readWorkflow('ci-check.yml').jobs.check.steps;
  for (const id of preflightIds) {
    const step = job.steps.find((entry) => entry.id === id);
    const original = shared.find((entry) => entry.id === id);
    assert.equal(step.run, original.run);
    assert.equal(step.shell, 'bash');
    assert.equal(
      step.if,
      id === 'release_relevance'
        ? "steps.check_config.outputs.should_run == 'true'"
        : undefined
    );
    assert.equal(step['continue-on-error'], undefined);
    assert.equal(step.env.GITHUB_TOKEN, undefined);
    if (id !== 'release_relevance')
      assert.equal(step.env.WORKFLOW_NAME, 'type-check.yaml');
  }
  assert.equal(
    job.steps.find((entry) => entry.id === 'check_config').env
      .CHANGED_FILES_FILE,
    expression('steps.changed_files.outputs.changed_files_path')
  );
  assert.equal(
    job.steps.find((entry) => entry.id === 'release_relevance').env.BEFORE_SHA,
    expression('github.event.before')
  );
  const lastPreflight = job.steps.findIndex(
    (step) => step.id === 'release_relevance'
  );
  for (const name of heavyNames) {
    const step = job.steps.find((entry) => entry.name === name);
    assert.ok(job.steps.indexOf(step) > lastPreflight);
    // Conditions without a status override retain Actions' implicit success().
    assert.equal(step.if, decision);
    assert.equal(step['continue-on-error'], undefined);
  }
  const summary = job.steps.at(-1);
  assert.equal(summary.name, 'Report skipped type check');
  assert.equal(
    summary.if,
    "steps.check_config.outputs.should_run != 'true' || steps.release_relevance.outputs.run_checks != 'true'"
  );
  assert.match(summary.run, /no compilation was performed/);
  assert.match(summary.run, /GITHUB_STEP_SUMMARY/);
});

function fixture(
  dir,
  { disabled = false, change = 'source', missingConfig = false, error } = {}
) {
  for (const file of [
    'tuturuuu.ts',
    'tuturuuu.ci.ts',
    'scripts/ci/resolve-changed-files.ts',
    'scripts/ci/resolve-changed-files-core.ts',
    'scripts/ci/github-deployment-markers.ts',
    'scripts/ci/workflow-config-core.ts',
    'scripts/ci/check-workflow-config.ts',
    'scripts/ci/release-only-changes.js',
  ]) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Workflow Test',
        '-c',
        'user.email=workflow-test@example.invalid',
        ...args,
      ],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}');
  const manifestPath = 'packages/sample/package.json';
  const manifest = path.join(dir, manifestPath);
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, '{"name":"fixture","version":"1.0.0"}');
  git('add', 'package.json', manifestPath);
  git('commit', '-qm', 'baseline');
  const before = git('rev-parse', 'HEAD');
  if (change === 'source')
    fs.writeFileSync(path.join(dir, 'source.ts'), 'export const value = 1;\n');
  else
    fs.writeFileSync(
      manifest,
      change === 'malformed'
        ? '{invalid'
        : '{"name":"fixture","version":"1.1.0"}'
    );
  git('add', manifestPath, ...(change === 'source' ? ['source.ts'] : []));
  git('commit', '-qm', 'change');
  const after = git('rev-parse', 'HEAD');
  if (disabled) {
    const config = path.join(dir, 'tuturuuu.ci.ts');
    fs.writeFileSync(
      config,
      fs
        .readFileSync(config, 'utf8')
        .replace("'type-check.yaml': true", "'type-check.yaml': false")
    );
  }
  if (missingConfig) fs.unlinkSync(path.join(dir, 'tuturuuu.ts'));
  if (error === 'check_config')
    fs.writeFileSync(path.join(dir, 'tuturuuu.ci.ts'), 'invalid syntax !!!');
  if (error === 'changed_files')
    fs.unlinkSync(path.join(dir, 'scripts/ci/resolve-changed-files-core.ts'));
  if (error === 'release_relevance')
    fs.unlinkSync(path.join(dir, 'scripts/ci/release-only-changes.js'));
  // Run shell steps with the same Node executable as this test, without installs.
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.symlinkSync(process.execPath, path.join(dir, 'bin/node'));
  return { dir, before, after };
}

function runPreflight(options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-check-inline-'));
  try {
    const { before, after } = fixture(dir, options);
    const event = options.event ?? 'push';
    const eventPath = path.join(dir, 'event.json');
    fs.writeFileSync(
      eventPath,
      JSON.stringify({
        before,
        after,
        commits: [
          {
            modified: [
              options.change === 'source' || !options.change
                ? 'source.ts'
                : 'packages/sample/package.json',
            ],
          },
        ],
      })
    );
    const outputs = {};
    for (const id of preflightIds) {
      if (
        id === 'release_relevance' &&
        outputs.check_config.should_run !== 'true'
      ) {
        outputs[id] = {};
        continue;
      }
      const step = job.steps.find((entry) => entry.id === id);
      const outputFile = path.join(dir, `${id}.output`);
      fs.writeFileSync(outputFile, '');
      const env = {
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        GITHUB_EVENT_NAME: event,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_SHA: after,
        GITHUB_REF_NAME: 'fixture',
        GITHUB_OUTPUT: outputFile,
        RUNNER_TEMP: dir,
        WORKFLOW_NAME: 'type-check.yaml',
        BEFORE_SHA:
          options.before === undefined
            ? event === 'workflow_dispatch'
              ? ''
              : before
            : options.before,
        CHANGED_FILES_FILE: outputs.changed_files?.changed_files_path ?? '',
      };
      const result = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run],
        { cwd: dir, env, encoding: 'utf8' }
      );
      if (result.status !== 0) return { failure: id, heavy: false, outputs };
      outputs[id] = Object.fromEntries(
        fs
          .readFileSync(outputFile, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const split = line.indexOf('=');
            return [line.slice(0, split), line.slice(split + 1)];
          })
      );
    }
    return {
      failure: null,
      heavy:
        outputs.check_config.should_run === 'true' &&
        outputs.release_relevance.run_checks === 'true',
      outputs,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const [name, options, config, release, heavy] of [
  ['source change', {}, 'true', 'true', true],
  ['release-only metadata', { change: 'release' }, 'true', 'false', false],
  ['disabled toggle', { disabled: true }, 'false', undefined, false],
  [
    'disabled release',
    { disabled: true, change: 'release' },
    'false',
    undefined,
    false,
  ],
  ['manual dispatch', { event: 'workflow_dispatch' }, 'true', 'true', true],
  [
    'disabled manual dispatch',
    { disabled: true, event: 'workflow_dispatch' },
    'false',
    undefined,
    false,
  ],
  [
    'missing comparison',
    { change: 'release', before: '' },
    'true',
    'true',
    true,
  ],
  [
    'zero comparison',
    { change: 'release', before: '0'.repeat(40) },
    'true',
    'true',
    true,
  ],
  [
    'unavailable comparison',
    { change: 'release', before: 'unavailable-sha' },
    'true',
    'true',
    true,
  ],
  ['malformed manifest', { change: 'malformed' }, 'true', 'true', true],
  ['missing CI config', { missingConfig: true }, 'true', 'true', true],
]) {
  test(`actual inline scripts preserve ${name} decisions`, () => {
    const result = runPreflight(options);
    assert.equal(result.failure, null);
    assert.equal(result.outputs.check_config.should_run, config);
    assert.equal(result.outputs.release_relevance.run_checks, release);
    assert.equal(result.heavy, heavy);
  });
}

for (const id of preflightIds) {
  test(`execution errors in ${id} stop preflight before heavy steps`, () => {
    const result = runPreflight({ error: id });
    assert.equal(result.failure, id);
    assert.equal(result.heavy, false);
    assert.equal(result.outputs[id], undefined);
  });
}

test('fixture setup failures remove the allocated temp directory', (t) => {
  const createDirectory = fs.mkdtempSync;
  let allocatedDirectory;
  t.mock.method(fs, 'mkdtempSync', (...args) => {
    allocatedDirectory = createDirectory(...args);
    return allocatedDirectory;
  });
  t.mock.method(fs, 'copyFileSync', () => {
    throw new Error('fixture copy failed');
  });
  assert.throws(() => runPreflight({}), /fixture copy failed/);
  assert.ok(allocatedDirectory);
  assert.equal(fs.existsSync(allocatedDirectory), false);
});

test('disabled configuration skips release detection even when its script is unavailable', () => {
  const result = runPreflight({ disabled: true, error: 'release_relevance' });
  assert.equal(result.failure, null);
  assert.equal(result.heavy, false);
  assert.deepEqual(result.outputs.release_relevance, {});
});
