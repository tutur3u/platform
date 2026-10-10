const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const gate = readWorkflow('ci-check.yml');
const expression = (body) => `\${{ ${body} }}`;

test('release relevance is opt-in and shares the exact full-history checkout', () => {
  const call = gate.on.workflow_call;
  assert.deepEqual(call.inputs.check_release_only, {
    required: false,
    type: 'boolean',
    default: false,
    description: 'Also detect whether this push contains only release metadata',
  });
  assert.equal(
    call.outputs.run_checks.value,
    expression('jobs.check.outputs.run_checks')
  );
  assert.equal(
    call.outputs.should_run.value,
    expression('jobs.check.outputs.should_run')
  );
  assert.equal(gate.jobs.check.name, 'Check CI Config');
  assert.deepEqual(Object.keys(gate.jobs), ['check']);
  assert.deepEqual(gate.permissions, { contents: 'read', deployments: 'read' });
  const checkouts = gate.jobs.check.steps.filter((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, expression('github.sha'));
  assert.equal(checkouts[0].with['fetch-depth'], 0);
  assert.equal(checkouts[0].with['sparse-checkout-cone-mode'], false);
  for (const file of [
    'release-only-changes.js',
    'resolve-changed-files.ts',
    'check-workflow-config.ts',
  ]) {
    assert.ok(
      checkouts[0].with['sparse-checkout'].includes(`scripts/ci/${file}`)
    );
  }
  assert.equal(
    gate.jobs.check.outputs.run_checks,
    expression("steps.release_relevance.outputs.run_checks || 'true'")
  );
  assert.equal(
    gate.jobs.check.outputs.should_run,
    expression('steps.check_config.outputs.should_run')
  );
  const release = gate.jobs.check.steps.find(
    (step) => step.id === 'release_relevance'
  );
  assert.equal(release.if, 'inputs.check_release_only');
  assert.equal(release.shell, 'bash');
  assert.equal(release.env.BEFORE_SHA, expression('github.event.before'));
  assert.match(
    release.run,
    /node scripts\/ci\/release-only-changes\.js "\$BEFORE_SHA" "\$GITHUB_SHA"/
  );
  assert.equal(release['continue-on-error'], undefined);
});

for (const [name, aggregate, checkName, shardName] of [
  ['turbo-unit-tests.yaml', 'build', 'Unit Tests (24)', 'Unit test shard'],
  ['codecov.yaml', 'test', 'Run tests and collect coverage', 'Coverage shard'],
]) {
  test(`${name} preserves heavy checks and requires both shared preflight decisions`, () => {
    const workflow = readWorkflow(name);
    assert.equal(workflow.jobs['release-relevance'], undefined);
    assert.equal(
      workflow.jobs['check-ci'].uses,
      './.github/workflows/ci-check.yml'
    );
    assert.deepEqual(workflow.jobs['check-ci'].with, {
      workflow_name: name,
      check_release_only: true,
    });
    const job = workflow.jobs[aggregate];
    assert.equal(job.name, checkName);
    const condition = expression(
      "!cancelled() && needs.check-ci.result == 'success' && (needs.duplicate-validation.result != 'success' || needs.duplicate-validation.outputs.run_checks != 'false') && needs.check-ci.outputs.should_run == 'true' && needs.check-ci.outputs.run_checks == 'true'"
    );
    assert.equal(job.if, condition);
    assert.deepEqual(
      job.needs,
      shardName
        ? ['check-ci', 'duplicate-validation', 'test-shards']
        : ['check-ci']
    );
    if (shardName) {
      const shard = workflow.jobs['test-shards'];
      assert.deepEqual(shard.needs, ['check-ci', 'duplicate-validation']);
      assert.equal(shard.if, condition);
      assert.equal(shard.name, `${shardName} (${expression('matrix.shard')})`);
      assert.deepEqual(shard.strategy.matrix.shard, [0, 1, 2, 3]);
      assert.equal(shard.strategy['fail-fast'], false);
      assert.equal(shard['timeout-minutes'], 20);
      assert.equal(
        job.steps[0].env.TEST_RESULT,
        expression('needs.test-shards.result')
      );
      assert.equal(job.steps[0].run, 'test "$TEST_RESULT" = success');
      assert.deepEqual(workflow.permissions, { contents: 'read' });
      assert.deepEqual(workflow.jobs['check-ci'].permissions, {
        contents: 'read',
        deployments: 'read',
      });
      assert.equal(
        workflow.concurrency.group,
        `${expression('github.workflow')}-${expression('github.ref')}-${expression("(github.ref == 'refs/heads/main' || github.ref == 'refs/heads/production' || startsWith(github.ref, 'refs/heads/release-please--branches--')) && format('{0}-{1}-{2}', github.sha, github.event_name, github.run_id) || 'latest'")}`
      );
      assert.equal(
        workflow.concurrency['cancel-in-progress'],
        expression(
          "github.ref != 'refs/heads/main' && github.ref != 'refs/heads/production' && !startsWith(github.ref, 'refs/heads/release-please--branches--')"
        )
      );
    }
    const triggers =
      typeof workflow.on === 'string'
        ? [workflow.on]
        : Object.keys(workflow.on).sort();
    assert.deepEqual(
      triggers,
      shardName ? ['push'] : ['push', 'workflow_dispatch']
    );
    if (name === 'codecov.yaml') {
      assert.ok(
        job.steps.some((step) => step.uses === 'codecov/codecov-action@v7')
      );
      assert.ok(
        workflow.jobs['test-shards'].steps.some(
          (step) => step.uses === 'actions/upload-artifact@v7'
        )
      );
    }
  });
}

test('shared release step passes through true/false and fails on execution errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-preflight-step-'));
  const step = gate.jobs.check.steps.find(
    (entry) => entry.id === 'release_relevance'
  );
  try {
    for (const result of ['true', 'false', 'failure']) {
      const output = path.join(dir, 'output');
      fs.writeFileSync(output, '');
      fs.writeFileSync(
        path.join(dir, 'node'),
        result === 'failure'
          ? '#!/bin/sh\nexit 1\n'
          : `#!/bin/sh\necho ${result}\n`,
        { mode: 0o755 }
      );
      const run = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run],
        {
          cwd: root,
          env: {
            PATH: `${dir}:${process.env.PATH}`,
            BEFORE_SHA: 'before',
            GITHUB_SHA: 'after',
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
        }
      );
      assert.equal(run.status, result === 'failure' ? 1 : 0);
      assert.equal(
        fs.readFileSync(output, 'utf8'),
        result === 'failure' ? '' : `run_checks=${result}\n`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real release detector defaults to run for missing and invalid comparisons', () => {
  const script = path.join(root, 'scripts/ci/release-only-changes.js');
  for (const args of [
    [],
    ['', 'HEAD'],
    ['0'.repeat(40), 'HEAD'],
    ['not-a-revision', 'HEAD'],
  ]) {
    const run = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0);
    assert.equal(run.stdout.trim(), 'true');
  }
});

// Execute each committed gate with GitHub's implicit success dependency rule:
// a status function must override it so a failed proof cannot skip validation.
function evaluateValidationGate(job, needs, isCancelled = false) {
  const body = job.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  if (!/\b(?:always|cancelled|failure|success)\(\)/.test(body)) {
    if (
      Object.values(needs).some((dependency) => dependency.result !== 'success')
    )
      return false;
  }
  const source = body.replace(/needs\.([a-z-]+)/g, (_, id) => `needs['${id}']`);
  return Function(
    'needs',
    'cancelled',
    `return (${source});`
  )(needs, () => isCancelled);
}

for (const [workflowName, jobs] of [
  ['codecov.yaml', ['test-shards', 'test']],
  ['turbo-unit-tests.yaml', ['test-shards', 'build']],
  ['biome-check.yaml', ['format', 'lint']],
]) {
  const workflow = readWorkflow(workflowName);
  for (const id of jobs) {
    test(`${workflowName}/${id} runs without a successful explicit duplicate proof`, () => {
      const needs = {
        'check-ci': {
          result: 'success',
          outputs: { should_run: 'true', run_checks: 'true' },
        },
        'test-shards': { result: 'success' },
      };
      for (const [result, output, expected] of [
        ['failure', undefined, true],
        ['failure', 'false', true],
        ['cancelled', undefined, true],
        ['skipped', undefined, true],
        ['success', undefined, true],
        ['success', '', true],
        ['success', 'invalid', true],
        ['success', 'true', true],
        ['success', 'false', false],
      ]) {
        needs['duplicate-validation'] = {
          result,
          outputs: { run_checks: output ?? '' },
        };
        assert.equal(
          evaluateValidationGate(workflow.jobs[id], needs),
          expected,
          `${result}/${output ?? 'absent'}`
        );
      }
      needs['duplicate-validation'] = { result: 'failure', outputs: {} };
      assert.equal(
        evaluateValidationGate(workflow.jobs[id], needs, true),
        false
      );
      needs['check-ci'].outputs.should_run = 'false';
      assert.equal(evaluateValidationGate(workflow.jobs[id], needs), false);
      needs['check-ci'].outputs.should_run = 'true';
      needs['check-ci'].result = 'failure';
      assert.equal(evaluateValidationGate(workflow.jobs[id], needs), false);
      needs['check-ci'].result = 'success';
      needs['check-ci'].outputs.run_checks = 'false';
      assert.equal(
        evaluateValidationGate(workflow.jobs[id], needs),
        workflowName === 'biome-check.yaml'
      );
      if (id === 'test' || id === 'build') {
        needs['check-ci'].outputs.run_checks = 'true';
        needs['test-shards'].result = 'failure';
        assert.equal(evaluateValidationGate(workflow.jobs[id], needs), true);
        assert.equal(
          workflow.jobs[id].steps[0].run,
          'test "$TEST_RESULT" = success'
        );
      }
    });
  }
}
