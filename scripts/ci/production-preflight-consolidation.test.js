const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const gate = readWorkflow('ci-check.yml');
const step = gate.jobs.check.steps.find(
  (item) => item.id === 'pr_release_relevance'
);
const apps = ['meet', 'lettin', 'parley'];

test('Cloudflare release relevance shares the existing config job and gates validation', () => {
  assert.deepEqual(gate.on.workflow_call.inputs.check_pr_release_only, {
    required: false,
    type: 'boolean',
    default: false,
    description: 'Also detect release-only PR changes; other events always run',
  });
  assert.equal(step.if, 'inputs.check_pr_release_only');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
  assert.equal(step.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
  assert.equal(step.env.HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
  assert.ok(
    gate.jobs.check.outputs.run_checks.includes(
      'steps.pr_release_relevance.outputs.run_checks'
    )
  );
  const planner = readWorkflow('vercel-production.yaml');
  for (const app of apps) {
    const file = `${app}-cloudflare.yaml`;
    const workflow = readWorkflow(file);
    assert.equal(workflow.jobs['release-relevance'], undefined);
    assert.equal(
      workflow.jobs['check-ci'].uses,
      './.github/workflows/ci-check.yml'
    );
    assert.equal(workflow.jobs['check-ci'].with.check_pr_release_only, true);
    assert.equal(workflow.jobs['check-ci'].with.workflow_name, file);
    assert.deepEqual(workflow.jobs.validate.needs, ['check-ci']);
    assert.equal(
      workflow.jobs.validate.if,
      "needs.check-ci.outputs.should_run == 'true' && needs.check-ci.outputs.run_checks == 'true'"
    );
    const condition = workflow.jobs.validate.if.replaceAll(
      'needs.check-ci',
      "needs['check-ci']"
    );
    for (const [shouldRun, runChecks, expected] of [
      ['true', 'true', true],
      ['false', 'true', false],
      ['true', 'false', false],
    ]) {
      assert.equal(
        Function(
          'needs',
          `return (${condition})`
        )({
          'check-ci': {
            outputs: { should_run: shouldRun, run_checks: runChecks },
          },
        }),
        expected
      );
    }
    assert.equal(workflow.jobs.deploy.needs, 'validate');
    assert.equal(
      workflow.jobs.deploy.if,
      "github.ref == 'refs/heads/production'"
    );
    assert.equal(
      planner.jobs[`deploy-${app}-cloudflare`].uses,
      `./.github/workflows/${file}`
    );
    assert.equal(workflow.concurrency['cancel-in-progress'], false);
    assert.equal(workflow.concurrency.queue, 'max');
  }
});

test('shared shell preserves PR base/head relevance and always runs on production/manual events', (t) => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), 'production-preflight-')
  );
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'CI Fixture');
  git('config', 'user.email', 'ci@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(fixture, 'scripts/ci'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'release-only-changes.js'),
    path.join(fixture, 'scripts/ci/release-only-changes.js')
  );
  fs.writeFileSync(path.join(fixture, 'package.json'), '{"version":"1.0.0"}');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(fixture, 'package.json'), '{"version":"1.0.1"}');
  git('add', '.');
  git('commit', '-qm', 'release');
  const release = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(fixture, 'runtime.js'), 'module.exports = 1;');
  git('add', '.');
  git('commit', '-qm', 'runtime');
  const runtime = git('rev-parse', 'HEAD');
  for (const [event, before, head, expected] of [
    ['pull_request', base, release, 'false'],
    ['pull_request', base, runtime, 'true'],
    ['pull_request', '', '', 'true'],
    ['pull_request', 'missing', release, 'true'],
    ['push', base, release, 'true'],
    ['workflow_dispatch', base, release, 'true'],
  ]) {
    const output = path.join(fixture, 'output');
    fs.writeFileSync(output, '');
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run],
      {
        cwd: fixture,
        encoding: 'utf8',
        env: {
          ...process.env,
          BASE_SHA: before,
          HEAD_SHA: head,
          GITHUB_EVENT_NAME: event,
          GITHUB_OUTPUT: output,
        },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(output, 'utf8').trim(),
      `run_checks=${expected}`,
      `${event}/${head}`
    );
  }
  fs.unlinkSync(path.join(fixture, 'scripts/ci/release-only-changes.js'));
  const output = path.join(fixture, 'failure-output');
  const failed = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run],
    {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_SHA: base,
        HEAD_SHA: release,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_OUTPUT: output,
      },
    }
  );
  assert.notEqual(
    failed.status,
    0,
    'execution errors must fail the shared config job'
  );
  assert.equal(fs.existsSync(output), false);
});
