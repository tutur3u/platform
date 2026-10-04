const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
function yaml(file) {
  return JSON.parse(
    execFileSync(
      'ruby',
      [
        '-e',
        "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV[0]))",
        file,
      ],
      { encoding: 'utf8' }
    )
  );
}
const action = yaml(path.join(__dirname, 'action.yml'));
const steps = action.runs.steps;
const trusted = steps.find((step) => step.id === 'trusted');
const writer = steps.find((step) => step.id === 'writer');
const readonly = steps.find((step) => step.id === 'readonly');
function context(overrides = {}) {
  return {
    github: {
      event_name: 'push',
      actor: 'vhpx',
      ref: 'refs/heads/main',
      sha: 'current',
      event: {
        repository: { default_branch: 'main' },
        pull_request: { base: { sha: 'base' } },
      },
    },
    runner: { os: 'Linux', arch: 'X64' },
    inputs: { family: 'type-check', 'cross-lock-restore': 'false' },
    hashes: { 'turbo.json': 'configA', 'bun.lock': 'lockA' },
    ...overrides,
  };
}
function render(template, fixture) {
  return template.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
    String(
      vm.runInNewContext(expression, {
        ...fixture,
        format: (pattern, ...values) =>
          pattern.replace(/\{(\d+)\}/g, (_, index) => values[index]),
        hashFiles: (file) => fixture.hashes[file],
      })
    )
  );
}
function enabled(step, fixture) {
  return render(step.if, fixture) === 'true';
}
function restoreKey(step, fixture, archives) {
  const exact = render(step.with.key, fixture);
  if (archives.includes(exact)) return exact;
  const prefixes = render(step.with['restore-keys'], fixture)
    .split('\n')
    .filter(Boolean);
  for (const prefix of prefixes) {
    const found = archives.find((key) => key.startsWith(prefix));
    if (found) return found;
  }
  return undefined;
}

test('parsed writer gate retains default-branch-only trust for the event/ref/actor matrix', () => {
  for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
    for (const ref of ['main', 'feature', 'production']) {
      for (const actor of ['vhpx', 'dependabot[bot]']) {
        const fixture = context();
        Object.assign(fixture.github, {
          event_name: event,
          ref: `refs/heads/${ref}`,
          actor,
        });
        const allowed =
          event !== 'pull_request' &&
          ref === 'main' &&
          actor !== 'dependabot[bot]';
        assert.equal(
          enabled(writer, fixture),
          allowed,
          `${event}/${ref}/${actor}`
        );
        assert.equal(enabled(trusted, fixture), allowed);
        assert.equal(enabled(readonly, fixture), !allowed);
      }
    }
  }
  const custom = context();
  custom.github.event.repository.default_branch = 'trunk';
  custom.github.ref = 'refs/heads/trunk';
  assert.equal(enabled(writer, custom), true);
});

test('parsed keys prefer exact, same-lock, then opted-in same-config archives', () => {
  for (const step of [trusted, readonly, writer]) {
    const fixture = context();
    const exact = render(step.with.key, fixture);
    const sameLock = exact.replace(/-(current|base)$/, '-older');
    const crossLock = sameLock.replace('lockA', 'lockB');
    assert.equal(
      restoreKey(step, fixture, [crossLock, sameLock, exact]),
      exact
    );
    assert.equal(restoreKey(step, fixture, [crossLock, sameLock]), sameLock);
    assert.equal(restoreKey(step, fixture, [crossLock]), undefined);
    fixture.inputs['cross-lock-restore'] = 'true';
    assert.equal(restoreKey(step, fixture, [crossLock]), crossLock);
    for (const [before, after] of [
      ['configA', 'configB'],
      ['type-check', 'coverage'],
      ['Linux', 'Windows'],
      ['X64', 'ARM64'],
      ['v2', 'v1'],
    ]) {
      assert.equal(
        restoreKey(step, fixture, [crossLock.replace(before, after)]),
        undefined
      );
    }
    assert.equal(restoreKey(step, fixture, []), undefined);
  }
  assert.equal(render(readonly.with.key, context()).endsWith('-base'), true);
  const push = context();
  // Model GitHub's empty value for an absent pull_request.base.sha.
  push.github.event.pull_request.base.sha = '';
  assert.equal(render(readonly.with.key, push).endsWith('-current'), true);
});

test('only Type Check opts in; tasks and credential gates stay independent of archive hits', () => {
  const consumers = [];
  for (const file of fs.readdirSync(path.join(root, '.github/workflows'))) {
    if (!/\.ya?ml$/.test(file)) continue;
    const workflowPath = path.join(root, '.github/workflows', file);
    if (
      !fs
        .readFileSync(workflowPath, 'utf8')
        .includes('setup-turbo-fallback-cache')
    )
      continue;
    const workflow = yaml(workflowPath);
    for (const job of Object.values(workflow.jobs || {})) {
      for (const step of job.steps || []) {
        if (step.uses === './.github/actions/setup-turbo-fallback-cache') {
          if (step.with?.['cross-lock-restore'] === 'true')
            consumers.push(file);
        }
        if (
          file === 'type-check.yaml' &&
          step.uses === './.github/actions/run-with-turbo-remote-cache'
        ) {
          assert.doesNotMatch(step.if, /cache-hit|cache-matched-key/);
          assert.match(step.with.token, /github\.ref == 'refs\/heads\/main'/);
          assert.match(
            step.with.token,
            /github\.ref == 'refs\/heads\/production'/
          );
          assert.match(step.with.token, /github\.actor != 'dependabot\[bot\]'/);
          assert.match(step.with.token, /github\.event_name != 'pull_request'/);
        }
      }
    }
  }
  assert.deepEqual(consumers, ['type-check.yaml']);
  assert.equal(action.inputs['cross-lock-restore'].default, 'false');
  for (const step of [trusted, writer, readonly])
    assert.equal(step.with.path, '.turbo/cache');
  assert.equal(writer.uses, 'actions/cache@v6');
  assert.equal(writer.with['lookup-only'], true);
  assert.equal(writer.with.key, trusted.with.key);
  assert.equal(writer.with['restore-keys'], trusted.with['restore-keys']);
  assert.equal(trusted.uses, 'actions/cache/restore@v6');
  assert.equal(readonly.uses, 'actions/cache/restore@v6');
  const source = fs.readFileSync(path.join(__dirname, 'action.yml'), 'utf8');
  assert.doesNotMatch(
    source,
    /secrets\.|TURBO_TOKEN|GITHUB_ENV|id-token|pull_request_target|node_modules/
  );
});

test('summary executes miss/exact/prefix cases and outputs refer to actual restore steps', () => {
  const summary = steps.find((step) => step.shell === 'bash');
  for (const [matched, hit, expected] of [
    ['', '', 'MISS'],
    ['key-exact', 'true', 'exact archive restore'],
    ['key-prefix', 'false', 'prefix archive restore'],
  ]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'turbo-fallback-'));
    try {
      const file = path.join(directory, 'summary');
      execFileSync('bash', ['-c', summary.run], {
        env: {
          ...process.env,
          MATCHED_KEY: matched,
          CACHE_HIT: hit,
          GITHUB_STEP_SUMMARY: file,
        },
      });
      const result = fs.readFileSync(file, 'utf8');
      assert.ok(result.includes(expected));
      assert.match(result, /not a Turbo task hit/);
      assert.match(result, /Checks always run/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  for (const output of Object.values(action.outputs)) {
    assert.match(output.value, /steps\.trusted\.outputs/);
    assert.match(output.value, /steps\.readonly\.outputs/);
    assert.doesNotMatch(output.value, /steps\.writer/);
  }
});
